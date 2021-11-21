import axios from "axios";
import {
  getSecretFromSecretsManager,
  getSignedDownloadUrl,
} from "./helpers/aws-helper";

export const handler = async (event: any = {}): Promise<any> => {
  await sendPdfByWhatsApp(
    event.pdfKey,
    event.template,
    event.recipient,
    event.bodyMessage
  );
};

async function sendPdfByWhatsApp(
  pdfKey: string,
  template: string,
  recipient: string,
  bodyMessage: { placeholders: [] }
) {
  let params: any[] = [];
  bodyMessage.placeholders.forEach(function (value: string) {
    params.push({ type: "text", text: value });
  });

  const url = await getSignedDownloadUrl(
    process.env.destinationBucket as string,
    pdfKey,
    600
  );
  const keys = JSON.parse(
    await getSecretFromSecretsManager(process.env.messageBirdKeyArn as string)
  );
  const hsm = {
    language: { code: "es" },
    namespace: keys.FB_WHATSAPP_NAMESPACE,
    templateName: template,
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
    to: recipient,
  };

  const headers = {
    Authorization: "AccessKey " + keys.MESSAGEBIRD_API_KEY,
    "Content-Type": "application/json; charset=utf-8",
  };

  await axios.post("https://conversations.messagebird.com/v1/send", body, {
    headers: headers,
  });
}
