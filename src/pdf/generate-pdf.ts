import "chrome-aws-lambda";
import { v4 as uuidv4 } from "uuid";
import Chromium = require("chrome-aws-lambda");
import sgMail = require("@sendgrid/mail");
import axios from "axios";
import Mustache = require("mustache");
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3";
const getStream = require("get-stream");

export const handler = async (event: any = {}): Promise<any> => {
  const client = new S3Client({});
  await Promise.all(
    event.Records.map(async (entry: any) => {
      await processPdfTask(JSON.parse(entry.body) as PdfTask, client);
    })
  );
};

async function processPdfTask(task: PdfTask, client: S3Client) {
  const html = await getFileFromS3(
    process.env.sourceBucket as string,
    task.bodyKey,
    client
  );
  const pdf = await generatePdf(html);

  if (task.type == "email") {
    await sendPdfByMail(pdf, task, client);
  } else if (task.type == "whatsapp") {
    const pdfKey = await storePdf(pdf, client);
    await sendPdfByWhatsApp(pdfKey, client, task);
  }
}

async function getFileFromS3(
  bucket: string,
  key: string,
  client: S3Client
): Promise<Buffer> {
  const params: GetObjectCommandInput = {
    Bucket: bucket,
    Key: key,
  };
  const file = await client.send(new GetObjectCommand(params));
  return getStream.buffer(file.Body);
}

async function storePdf(pdf: Buffer, client: S3Client): Promise<string> {
  const filename = uuidv4() + ".pdf";
  const savePdfParams: PutObjectCommandInput = {
    Bucket: process.env.destinationBucket as string,
    Body: pdf,
    Key: filename,
    ContentType: "application/pdf",
  };

  await client.send(new PutObjectCommand(savePdfParams));
  return filename;
}

async function sendPdfByWhatsApp(
  pdfKey: string,
  client: S3Client,
  task: PdfTask
) {
  const whatsappData = await getSecret(process.env.messageBirdKeyArn as string);
  let params: any[] = [];
  task.bodyMessage.placeholders.forEach(function (value: string) {
    params.push({ type: "text", text: value });
  });
  const keys = JSON.parse(whatsappData);
  const signedUrlParams: GetObjectCommandInput = {
    Bucket: process.env.destinationBucket as string,
    Key: pdfKey,
  };
  const url = await getSignedUrl(
    client,
    new GetObjectCommand(signedUrlParams),
    { expiresIn: 600 }
  );
  const hsm = {
    language: { code: "es" },
    namespace: keys.FB_WHATSAPP_NAMESPACE,
    templateName: task.template,
    components: [
      {
        type: "header",
        parameters: [
          { type: "document", document: { url: url, caption: pdfKey } },
        ],
      },
      { type: "body", parameters: params },
    ],
  };

  const body = {
    content: { hsm: hsm },
    from: keys.MESSAGEBIRD_WHATSAPP_CHANNEL,
    type: "hsm",
    to: task.recipient,
  };

  const headers = {
    Authorization: "AccessKey " + keys.MESSAGEBIRD_API_KEY,
    "Content-Type": "application/json; charset=utf-8",
  };

  const response = await axios.post(
    "https://conversations.messagebird.com/v1/send",
    body,
    {
      headers: headers,
    }
  );
  console.log(response);
}

async function generatePdf(html: Buffer): Promise<Buffer> {
  let browser = await Chromium.puppeteer.launch({
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

async function sendPdfByMail(pdf: Buffer, task: PdfTask, client: S3Client) {
  const apiKey = getSecret(process.env.sendgridApiKeyArn as string);
  const template = await getFileFromS3(
    process.env.staticsBucket as string,
    "templates/email.html",
    client
  );
  const subject = task.subject ?? "Le adjuntamos la inforamción solicitada";
  const templateVars = { body: task.bodyMessage, subject: subject };
  const msg = {
    to: task.recipient,
    from: "consultas@mundiaguabalear.com",
    subject: subject,
    html: Mustache.render(template.toString("utf8"), templateVars),
    text: task.bodyMessage,
    attachments: [
      {
        content: pdf.toString("base64"),
        filename: uuidv4() + ".pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  sgMail.setApiKey(await apiKey);
  await sgMail.send(msg);
}

async function getSecret(key: string): Promise<string> {
  const awsSecret = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: key })
  );
  return awsSecret.SecretString!!;
}
