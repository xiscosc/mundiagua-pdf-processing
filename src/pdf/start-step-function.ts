import {
  StartExecutionCommand,
  StartExecutionCommandInput,
  SFNClient,
} from "@aws-sdk/client-sfn";

export const handler = async (event: any = {}): Promise<any> => {
  const stepFunctionArn: string = process.env.stepFunctionArn!!;
  const client = new SFNClient({});
  await Promise.all(
    event.Records.map(async (entry: any) => {
      const params: StartExecutionCommandInput = {
        stateMachineArn: stepFunctionArn,
        input: entry.Sns.Message,
      };
      await client.send(new StartExecutionCommand(params));
    })
  );
};
