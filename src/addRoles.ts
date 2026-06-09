//backend\src\addRoles.ts
import dotenv from 'dotenv';
dotenv.config();   // <-- load .env

import prisma from './lib/prisma';

async function addRoles() {
    const tenantId = 1; // use your actual tenant id if different
    await prisma.role.createMany({
        data: [
            { tenantId, name: 'manager', description: 'Manager' },
            { tenantId, name: 'team', description: 'Team member (read-only)' },
        ],
        skipDuplicates: true,
    });
    console.log('Roles added successfully');
}

addRoles()
    .catch(console.error)
    .finally(() => process.exit());