import {
  StartExecutionCommand,
  StartExecutionCommandInput,
  SFNClient,
} from "@aws-sdk/client-sfn";

export const handler = async (event: any = {}): Promise<any> => {
  const stepFunctionArn: string = process.env.stepFunctionArn!!;
  const client = new SFNClient({});
  event.Records.map(async (entry: any) => {
    const params: StartExecutionCommandInput = {
      stateMachineArn: stepFunctionArn,
      input: entry.body,
    };
    await client.send(new StartExecutionCommand(params));
  });
};
