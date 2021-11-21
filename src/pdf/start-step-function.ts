import {
  StartExecutionCommand,
  StartExecutionCommandInput,
  SFNClient,
} from "@aws-sdk/client-sfn";

export const handler = async (event: any = {}): Promise<any> => {
  console.log(event);
  const stepFunctionArn: string = process.env.stepFunctionArn!!;
  const client = new SFNClient({});
  event.Records.map(async (entry: any) => {
    const params: StartExecutionCommandInput = {
      stateMachineArn: stepFunctionArn,
      input: entry.body,
    };
    console.log(params);
    await client.send(new StartExecutionCommand(params));
  });
};
