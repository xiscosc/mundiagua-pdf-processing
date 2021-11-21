import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { App, Duration, Stack, StackProps } from "@aws-cdk/core";
import { BlockPublicAccess, Bucket, BucketProps } from "@aws-cdk/aws-s3";
import { Secret } from "@aws-cdk/aws-secretsmanager";
import { Queue } from "@aws-cdk/aws-sqs";
import { Runtime } from "@aws-cdk/aws-lambda";
import { NodejsFunction } from "@aws-cdk/aws-lambda-nodejs";
import * as path from "path";

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

    const deadLetterQueue = new Queue(
      this,
      "dlq-sqs--pdf-mundiagua-" + this.props.stage,
      { visibilityTimeout: Duration.seconds(5) }
    );

    const pdfQueue = new Queue(this, "sqs-pdf-mundiagua-" + this.props.stage, {
      visibilityTimeout: Duration.seconds(120),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1,
      },
    });

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
          staticsBucket: emailStaticsBucket.bucketName,
          sendgridApiKeyArn: sendgridSecret.secretArn,
          messageBirdKeyArn: messageBirdSecret.secretArn,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          nodeModules: ["chrome-aws-lambda", "puppeteer-core"],
        },
      }
    );

    sendgridSecret.grantRead(pdfLambda);
    messageBirdSecret.grantRead(pdfLambda);
    pdfProcessingBucket.grantReadWrite(pdfLambda);
    pdfSourceBucket.grantReadWrite(pdfLambda);
    emailStaticsBucket.grantRead(pdfLambda);
    pdfLambda.addEventSource(new SqsEventSource(pdfQueue, { batchSize: 1 }));
  }
}
