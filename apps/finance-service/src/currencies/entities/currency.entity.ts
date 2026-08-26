import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Household-agnostic catalog (#226). Not extending BaseEntity — the natural
// key (ISO 4217 code, or a crypto ticker) IS the primary key, there is no
// separate UUID identity for a currency.
@Entity({ name: 'currencies', schema: 'finance' })
export class Currency {
  @PrimaryColumn({ length: 10 })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  symbol: string | null;

  @Column({ name: 'is_crypto', default: false })
  isCrypto: boolean;

  @Column({ default: 2 })
  decimals: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
