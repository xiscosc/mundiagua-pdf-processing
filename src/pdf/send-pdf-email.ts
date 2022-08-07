import { v4 as uuidv4 } from "uuid";
import Mustache from "mustache";
import { getFileFromS3 } from "./helpers/aws-helper";
import {
  SESv2Client,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { createMimeMessage } from "mimetext";
import { TextEncoder } from "util";

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

  const defaultFrom = {
    name: "Consultas Mundiagua",
    addr: "consultas@mundiaguabalear.com>",
  };
  const from = task.from
    ? { name: task.from.name, addr: task.from.email }
    : defaultFrom;
  const replyTo = task.from
    ? `${task.from.email},consultas@mundiaguabalear.com`
    : "consultas@mundiaguabalear.com";
  const htmlBody = Mustache.render(template.toString("utf8"), templateVars);

  const msg = createMimeMessage();
  msg.setSender(from);
  msg.setRecipient(task.recipient);
  msg.setSubject(subject);
  msg.setHeader("Reply-To", replyTo);
  msg.setMessage("text/plain", task.bodyMessage);
  msg.setMessage("text/html", htmlBody);
  // @ts-ignore
  msg.setAttachment(`${uuidv4()}.pdf`, "application/pdf", msg.toBase64(pdf));
  const mailParams: SendEmailCommandInput = {
    Content: {
      Raw: {
        Data: new TextEncoder().encode(msg.asRaw()),
      },
    },
  };

  const client = new SESv2Client({});
  await client.send(new SendEmailCommand(mailParams));
}
