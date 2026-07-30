export interface KafkaModuleOptions {
  clientId: string;
  brokers: string[];
  groupId?: string;
}
