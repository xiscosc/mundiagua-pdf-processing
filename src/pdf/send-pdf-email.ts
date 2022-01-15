import { v4 as uuidv4 } from "uuid";
import Mustache from "mustache";
import {
  getFileFromS3,
  getSecretFromSecretsManager,
} from "./helpers/aws-helper";
import sgMail = require("@sendgrid/mail");
import { MailDataRequired } from "@sendgrid/helpers/classes/mail";
import { EmailData } from "@sendgrid/helpers/classes/email-address";

export const handler = async (event: EmailTask): Promise<any> => {
  await sendPdfByMail(event);
};

async function sendPdfByMail(task: EmailTask) {
  const pdf = await getFileFromS3(
    process.env.destinationBucket as string,
    task.pdfKey
  );
  const template = await getFileFromS3(
    process.env.staticsBucket as string,
    "templates/email.html"
  );
  const subject = task.subject ?? "Le adjuntamos la inforamción solicitada";
  const templateVars = {
    body: task.bodyMessage,
    subject: subject,
  };
  const defaultFrom: EmailData = {
    name: "Consultas Mundiagua",
    email: "consultas@mundiaguabalear.com",
  };

  const replyTo = task.from ? [defaultFrom, task.from] : [defaultFrom];
  const msg: MailDataRequired = {
    to: task.recipient,
    from: task.from ?? defaultFrom,
    replyToList: replyTo,
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

  sgMail.setApiKey(
    await getSecretFromSecretsManager(process.env.sendgridApiKeyArn as string)
  );
  await sgMail.send(msg);
}
