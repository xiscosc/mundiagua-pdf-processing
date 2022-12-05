import {
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import getStream from "get-stream";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Stream } from "stream";

export async function getFileFromS3(
  bucket: string,
  key: string
): Promise<Buffer> {
  const client = new S3Client({});
  const params: GetObjectCommandInput = {
    Bucket: bucket,
    Key: key,
  };
  const file = await client.send(new GetObjectCommand(params));
  return getStream.buffer(file.Body as Stream);
}

export async function saveFileToS3(
  bucket: string,
  key: string,
  body: Buffer,
  mimeType: string = "application/pdf"
) {
  const client = new S3Client({});
  const savePdfParams: PutObjectCommandInput = {
    Bucket: bucket,
    Body: body,
    Key: key,
    ContentType: mimeType,
  };

  await client.send(new PutObjectCommand(savePdfParams));
}

export async function getSecretFromSecretsManager(
  key: string
): Promise<string> {
  const awsSecret = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: key })
  );
  return awsSecret.SecretString!!;
}

export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  duration: number
): Promise<string> {
  const signedUrlParams: GetObjectCommandInput = { Bucket: bucket, Key: key };
  const client = new S3Client({});
  return await getSignedUrl(client, new GetObjectCommand(signedUrlParams), {
    expiresIn: duration,
  });
}
