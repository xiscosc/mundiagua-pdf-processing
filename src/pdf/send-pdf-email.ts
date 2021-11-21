import { v4 as uuidv4 } from "uuid";
import Mustache from "mustache";
import {
  getFileFromS3,
  getSecretFromSecretsManager,
} from "./helpers/aws-helper";
import sgMail = require("@sendgrid/mail");

export const handler = async (event: any = {}): Promise<any> => {
  await sendPdfByMail(
    event.pdfKey,
    event.taskSubject,
    event.BodyMessage,
    event.recipient
  );
};

async function sendPdfByMail(
  pdfKey: string,
  taskSubject: string,
  bodyMessage: string,
  recipient: string
) {
  const pdf = await getFileFromS3(
    process.env.destinationBucket as string,
    pdfKey
  );
  const template = await getFileFromS3(
    process.env.staticsBucket as string,
    "templates/email.html"
  );
  const subject = taskSubject ?? "Le adjuntamos la inforamción solicitada";
  const templateVars = { body: bodyMessage, subject: subject };
  const msg = {
    to: recipient,
    from: "consultas@mundiaguabalear.com",
    subject: subject,
    html: Mustache.render(template.toString("utf8"), templateVars),
    text: bodyMessage,
    attachments: [
      {
        content: pdf.toString("base64"),
        filename: uuidv4() + ".pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  sgMail.setApiKey(
    await getSecretFromSecretsManager(process.env.sendgridApiKeyArn as string)
  );
  await sgMail.send(msg);
}
