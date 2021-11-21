interface PdfTask {
  type: string;
  recipient: string;
  bodyKey: string;
  bodyMessage: string | any;
  subject?: string;
  template?: string;
  from?: { name?: string; email: string };
}

interface WhatsAppTask {
  pdfKey: string;
  recipient: string;
  bodyMessage: { placeholders: [] };
  template: string;
}

interface EmailTask {
  pdfKey: string;
  recipient: string;
  bodyKey: string;
  bodyMessage: string;
  subject: string;
  from?: { name?: string; email: string };
}
