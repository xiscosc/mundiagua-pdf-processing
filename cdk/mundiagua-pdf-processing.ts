#!/usr/bin/env node
import "source-map-support/register";
import { MundiaguaPdfProcessingStack } from "./mundiagua-pdf-processing-stack";
import { App } from "aws-cdk-lib";

const app = new App();
const stage: string = process.env.stage as string;
const messageBirdArn: string = process.env.messageBirdArn as string;

const pdfStackProps = {
  stage: stage,
  messageBirdArn: messageBirdArn,
};

new MundiaguaPdfProcessingStack(
  app,
  "MundiaguaPdfProcessingStack-" + stage,
  pdfStackProps
);
