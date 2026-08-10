import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only record of sensitive operations. One row per action. Stored in
 * the calling service's own schema (schema-per-service pattern) — the
 * concrete table name is determined by the `@Entity({ schema })` override
 * applied inside each service module.
 *
 * Never mutated after write. Retention is a separate concern (out of scope
 * for the MVP — assume "keep forever" until a retention policy lands).
 */
@Entity({ name: 'audit_log' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User id from X-User-Id header at the time of the action. Nullable
   * because a small number of paths run without a user (system tasks). */
  @Index()
  @Column({ name: 'actor_user_id', type: 'varchar', nullable: true })
  actorUserId: string | null;

  /** Household context, if any. Set for household-scoped operations so
   * "everything the owner did in home X" is a simple index scan. */
  @Index()
  @Column({ name: 'household_id', type: 'varchar', nullable: true })
  householdId: string | null;

  /** Dotted action name, e.g. "auth.logout_all", "finance.transaction.delete". */
  @Index()
  @Column({ type: 'varchar', length: 100 })
  action: string;

  /** The kind of thing acted on ("transaction", "account", "member"). */
  @Column({ name: 'resource_type', type: 'varchar', length: 50, nullable: true })
  resourceType: string | null;

  /** Id of the specific resource, when the action targets one. */
  @Column({ name: 'resource_id', type: 'varchar', nullable: true })
  resourceId: string | null;

  /** Free-form JSON — payload snapshot, old→new values, IP, user agent.
   * Cap enforced by AuditService.record so a runaway metadata blob can't
   * fill the table. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
