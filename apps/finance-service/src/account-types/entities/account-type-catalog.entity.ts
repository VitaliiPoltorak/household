import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Household-agnostic catalog (#227) — same shape as Currency (#226), plus
// `isSystem` so the UI can distinguish the 5 seeded defaults (not
// deletable/renamable) from household-added custom types (e.g. "paypal").
// Not extending BaseEntity — `code` IS the primary key, there is no
// separate UUID identity.
@Entity({ name: 'account_types', schema: 'finance' })
export class AccountTypeCatalog {
  @PrimaryColumn({ length: 40 })
  code: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
