import {
  mockCacheService,
  mockMailService,
  mockScreenshotService,
  mockStorageService,
} from "../../common/mocks/services";
import { Job } from "bull";
import { Container } from "typescript-ioc";
import { CacheService } from "../../../src/services/cache";
import { initializeIocAndApp } from "../../common/mocks/ioc";
import MailService from "../../../src/services/mail.service";
import { StorageService } from "../../../src/services/storage";
import ScreenshotAndMailJob from "../../../src/jobs/screenshot-and-mail.job";
import ScreenshotService from "../../../src/services/screenshot/screenshot.service";

describe("Job: Screenshot and Mail", () => {
  const jobWorkers = 5;
  const cachedUrl = "http://x.com";
  const email = "toks@gmail.com";
  const cachedUrlKey = "quickshot.screenshot-service.v1.x.com";
  const cachedUrlImageUrl = "https://cloudinary.com/d/x.com.png";
  const storedImageUrl = "https://cloudinary.com/d/uploaded-image.png";

  let mailService: MailService;
  let cacheService: CacheService;
  let storageService: StorageService;
  let screenshotService: ScreenshotService;

  beforeEach(() => {
    mailService = mockMailService({ sendImpl: () => {} });
    cacheService = mockCacheService({
      getImpl: (key: string) =>
        key === cachedUrlKey ? cachedUrlImageUrl : null,
    });

    storageService = mockStorageService({
      uploadResponse: { url: storedImageUrl },
    });

    screenshotService = mockScreenshotService({ cacheService, storageService });

    initializeIocAndApp([
      {
        bindName: "config",
        to: {
          jobs: {
            screenshotAndMail: {
              workers: jobWorkers,
            },
          },
        },
      },
      {
        bind: MailService,
        factory: () => mailService,
      },
      {
        bind: ScreenshotService,
        factory: () => screenshotService,
      },
    ]);
  });

  beforeEach(async (done) => {
    await Container.get(ScreenshotService).shutdown();
    done();
  });

  test("Should check job concurrency is resolved correctly from IOC", async (done) => {
    expect(ScreenshotAndMailJob.concurrency).toEqual(jobWorkers);
    done();
  });

  test("Should trigger job", async (done) => {
    const job = new ScreenshotAndMailJob();
    screenshotService.getOrScreenshot = jest.fn();

    await job.handle({ data: { email, url: cachedUrl } } as Job<{
      email: string;
      url: string;
    }>);

    expect(screenshotService.getOrScreenshot).toHaveBeenCalled();
    done();
  });

  test("Should send success mail when URL is valid", async (done) => {
    const job = new ScreenshotAndMailJob();
    const response = await job.handle({
      data: { email, url: cachedUrl },
    } as Job<{ email: string; url: string }>);

    expect(response).toEqual({ msg: "Screenshot sent successfully." });
    expect(mailService.send).toHaveBeenCalledTimes(1);
    expect(mailService.send).toBeCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(cachedUrl),
        subject: "Screenshot Successfull",
        to: email,
      })
    );

    done();
  });

  test("Should failure mail when URL is invalid", async (done) => {
    const invalidUrl = "https://thislinkdoesntwork.people";
    const job = new ScreenshotAndMailJob();

    const response = await job.handle({
      data: { email, url: invalidUrl },
    } as Job<{ email: string; url: string }>);

    expect(response).toEqual({ msg: "Invalid URL Email sent" });
    expect(mailService.send).toHaveBeenCalledTimes(1);
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(invalidUrl),
        subject: "Screenshot Failed",
        to: email,
      })
    );

    done();
  }, 20000);
});
