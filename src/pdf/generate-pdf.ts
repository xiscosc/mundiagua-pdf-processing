import "chrome-aws-lambda";
import { v4 as uuidv4 } from "uuid";
const puppeteer = require("puppeteer-core");
const Chromium = require("@sparticuz/chromium");
import { getFileFromS3, saveFileToS3 } from "./helpers/aws-helper";

export const handler = async (event: PdfTask): Promise<any> => {
  const html = await getFileFromS3(
    process.env.sourceBucket as string,
    event.bodyKey
  );
  const pdf = await generatePdf(html);
  const filename = uuidv4() + ".pdf";
  await saveFileToS3(process.env.destinationBucket as string, filename, pdf);
  return { ...event, pdfKey: filename };
};

async function generatePdf(html: Buffer): Promise<Buffer> {
  let browser = await puppeteer.launch({
    args: Chromium.args,
    defaultViewport: Chromium.defaultViewport,
    executablePath: await Chromium.executablePath,
    headless: Chromium.headless,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setContent(html.toString("utf8"), {
    waitUntil: ["load", "domcontentloaded", "networkidle0"],
  });
  return await page.pdf({
    format: "a4",
    printBackground: true,
    margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
  });
}
