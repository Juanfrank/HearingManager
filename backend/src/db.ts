import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process. This is a low-volume service
// (a handful of meetings/day) so no connection-pooling gymnastics needed.
export const prisma = new PrismaClient();
