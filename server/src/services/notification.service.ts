import type { Permission } from '@aurelle/shared';
import { prisma, type Db } from '../config/prisma';

/** Staff notification visible to everyone holding `permission`. */
export async function notifyStaff(n: { permission: Permission; type: string; title: string; body?: string; link?: string }, db: Db = prisma) {
  await db.notification.create({ data: { permission: n.permission, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? '' } });
}

export async function notifyUser(userId: string, n: { type: string; title: string; body?: string; link?: string }, db: Db = prisma) {
  await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? '' } });
}
