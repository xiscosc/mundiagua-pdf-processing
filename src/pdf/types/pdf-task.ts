interface PdfTask {
  type: string;
  recipient: string;
  bodyKey: string;
  bodyMessage: string | any;
  subject?: string;
  template?: string;
}
