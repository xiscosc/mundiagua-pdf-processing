import axios from "axios";
import {
  getSecretFromSecretsManager,
  getSignedDownloadUrl,
} from "./helpers/aws-helper";

export const handler = async (event: WhatsAppTask): Promise<any> => {
  await sendPdfByWhatsApp(event);
};

async function sendPdfByWhatsApp(task: WhatsAppTask) {
  let params: any[] = [];
  task.bodyMessage.placeholders.forEach(function (value: string) {
    params.push({ type: "text", text: value });
  });

  const url = await getSignedDownloadUrl(
    process.env.destinationBucket as string,
    task.pdfKey,
    600
  );
  const keys = JSON.parse(
    await getSecretFromSecretsManager(process.env.messageBirdKeyArn as string)
  );
  const hsm = {
    language: { code: "es" },
    namespace: keys.FB_WHATSAPP_NAMESPACE,
    templateName: task.template,
    components: [
      {
        type: "header",
        parameters: [
          { type: "document", document: { url: url, caption: task.pdfKey } },
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

  await axios.post("https://conversations.messagebird.com/v1/send", body, {
    headers: headers,
  });
}
