// scripts/migrateReferenceTypes.ts
import prisma from '../src/lib/prisma';

async function migrate() {
    const movements = await prisma.stockMovement.findMany();

    for (const m of movements) {
        let newRefType: string | null = null;

        if (m.toProjectId) {
            if (m.type === 'STOCK_IN') {
                newRefType = 'PROJECT_ORDER';
            } else if (m.type === 'STOCK_OUT') {
                // Check notes or maybe toProjectId is null for returns? Actually return sets toProjectId=null.
                // But old returns set toProjectId=null? In the old code, transferOut set toProjectId: null.
                // So if toProjectId is null AND notes contains 'Return', it's a return.
                if (m.notes && m.notes.toLowerCase().includes('return')) {
                    newRefType = 'PROJECT_RETURN';
                } else {
                    newRefType = 'PROJECT_CONSUME';
                }
            }
        } else if (m.toCustomerId) {
            newRefType = 'OFFICE_ISSUE';
        } else if (m.fromVendorId && m.type === 'STOCK_IN') {
            newRefType = 'PURCHASE_ORDER';
        } else {
            // Default: keep as MANUAL_ADJUSTMENT (or you can decide to set to something else)
            newRefType = 'MANUAL_ADJUSTMENT';
        }

        // If we determined a new type and it's different from current, update
        if (newRefType && newRefType !== m.referenceType) {
            await prisma.stockMovement.update({
                where: { id: m.id },
                data: { referenceType: newRefType as any },
            });
            console.log(`Updated movement ${m.id} to ${newRefType}`);
        }
    }

    console.log('Migration complete.');
}

migrate()
    .catch(console.error)
    .finally(() => process.exit());