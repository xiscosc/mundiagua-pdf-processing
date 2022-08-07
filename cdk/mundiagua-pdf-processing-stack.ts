import { SnsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { App, Duration, Stack, StackProps } from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, BucketProps } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Effect, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Topic } from "aws-cdk-lib/aws-sns";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as path from "path";
import {
  Chain,
  Choice,
  Condition,
  Fail,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";

interface MundiaguaPdfStackProps extends StackProps {
  stage: string;
  messageBirdArn: string;
  sendgridApiKeyArn: string;
}

export class MundiaguaPdfProcessingStack extends Stack {
  private readonly props: MundiaguaPdfStackProps;

  constructor(scope: App, id: string, props: MundiaguaPdfStackProps) {
    super(scope, id, props);
    this.props = props;

    const pdfBucketProps: BucketProps = {
      bucketName: "pdf-processing-mundiagua-" + this.props.stage,
      lifecycleRules: [{ expiration: Duration.days(7) }],
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    };

    const emailStaticsBucketProps: BucketProps = {
      bucketName: "email-statics-mundiagua-" + this.props.stage,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    };

    const sourceBucketProps: BucketProps = {
      bucketName: "pdf-source-mundiagua-" + this.props.stage,
      lifecycleRules: [{ expiration: Duration.days(7) }],
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    };

    const pdfProcessingBucket = new Bucket(
      this,
      "mundiagua-processing-pdf-" + this.props.stage,
      pdfBucketProps
    );
    const emailStaticsBucket = new Bucket(
      this,
      "mundiagua-email-statics-" + this.props.stage,
      emailStaticsBucketProps
    );
    const pdfSourceBucket = new Bucket(
      this,
      "mundiagua-pdf-source-" + this.props.stage,
      sourceBucketProps
    );

    const sendgridSecret = Secret.fromSecretCompleteArn(
      this,
      "sengrid-secret-" + this.props.stage,
      this.props.sendgridApiKeyArn
    );
    const messageBirdSecret = Secret.fromSecretCompleteArn(
      this,
      "messagebird-secret-" + this.props.stage,
      this.props.messageBirdArn
    );

    const pdfLambda = new NodejsFunction(
      this,
      "pdfGenerator-" + this.props.stage,
      {
        memorySize: 1024,
        runtime: Runtime.NODEJS_14_X,
        handler: "handler",
        timeout: Duration.minutes(2),
        entry: path.join(__dirname, `/../src/pdf/generate-pdf.ts`),
        environment: {
          destinationBucket: pdfProcessingBucket.bucketName,
          sourceBucket: pdfSourceBucket.bucketName,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          nodeModules: ["chrome-aws-lambda", "puppeteer-core"],
        },
      }
    );

    const sendPdfWhatsAppLambda = new NodejsFunction(
      this,
      "sendPdfWhatsApp-" + this.props.stage,
      {
        memorySize: 512,
        runtime: Runtime.NODEJS_14_X,
        handler: "handler",
        timeout: Duration.seconds(30),
        entry: path.join(__dirname, `/../src/pdf/send-pdf-whatsapp.ts`),
        environment: {
          destinationBucket: pdfProcessingBucket.bucketName,
          messageBirdKeyArn: messageBirdSecret.secretArn,
        },
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    const sendPdfEmailLambda = new NodejsFunction(
      this,
      "sendPdfEmail-" + this.props.stage,
      {
        memorySize: 512,
        runtime: Runtime.NODEJS_14_X,
        handler: "handler",
        timeout: Duration.seconds(30),
        entry: path.join(__dirname, `/../src/pdf/send-pdf-email.ts`),
        environment: {
          destinationBucket: pdfProcessingBucket.bucketName,
          staticsBucket: emailStaticsBucket.bucketName,
          sendgridApiKeyArn: sendgridSecret.secretArn,
        },
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    const sendEmailPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    sendPdfEmailLambda.role?.attachInlinePolicy(
      new Policy(this, `send-email-policy-${this.props.stage}`, {
        statements: [sendEmailPolicy],
      })
    );

    sendgridSecret.grantRead(sendPdfEmailLambda);
    messageBirdSecret.grantRead(sendPdfWhatsAppLambda);

    pdfProcessingBucket.grantWrite(pdfLambda);
    pdfProcessingBucket.grantRead(sendPdfWhatsAppLambda);
    pdfProcessingBucket.grantRead(sendPdfEmailLambda);
    pdfSourceBucket.grantRead(pdfLambda);
    emailStaticsBucket.grantRead(sendPdfEmailLambda);

    const pdfHandlerInvoke = new LambdaInvoke(this, "Generate PDF file", {
      lambdaFunction: pdfLambda,
      outputPath: "$.Payload",
    });

    const pdfWhatsAppInvoke = new LambdaInvoke(this, "Send pdf by WhatsApp", {
      lambdaFunction: sendPdfWhatsAppLambda,
      outputPath: "$.Payload",
    });

    const pdfEmailInvoke = new LambdaInvoke(this, "Send pdf by Email", {
      lambdaFunction: sendPdfEmailLambda,
      outputPath: "$.Payload",
    });

    const jobFailed = new Fail(this, "fail");

    const chain: Chain = Chain.start(pdfHandlerInvoke).next(
      new Choice(this, "Check task type")
        .when(Condition.stringEquals("$.type", "whatsapp"), pdfWhatsAppInvoke)
        .when(Condition.stringEquals("$.type", "email"), pdfEmailInvoke)
        .otherwise(jobFailed)
    );

    const stateMachine = new StateMachine(
      this,
      "MundiaguaPDFStateMachine-" + props.stage,
      { definition: chain }
    );

    const startStepFunctionLambda = new NodejsFunction(
      this,
      "startStepFunction-" + this.props.stage,
      {
        memorySize: 512,
        runtime: Runtime.NODEJS_14_X,
        handler: "handler",
        timeout: Duration.seconds(30),
        entry: path.join(__dirname, `/../src/pdf/start-step-function.ts`),
        environment: {
          stepFunctionArn: stateMachine.stateMachineArn,
        },
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    stateMachine.grantStartExecution(startStepFunctionLambda);
    const topic = new Topic(this, "topic-pdf-mundiagua-" + this.props.stage);
    startStepFunctionLambda.addEventSource(new SnsEventSource(topic));
  }
}
