export interface KafkaModuleOptions {
  clientId: string;
  brokers: string[];
  groupId?: string;
  // HMAC-SHA256 key used to authenticate messages between services (#63).
  // When unset (dev default), producers omit the signature header and consumers
  // accept unsigned messages — preserves the current test/dev workflow.
  signingKey?: string;
  // Optional second key accepted during rotation. Consumers try `signingKey`
  // first, then this. Producers always sign with the primary key.
  signingKeyPrev?: string;
}
