import prisma from '../lib/prisma';

async function cleanup() {
    console.log('⚠️  This will delete ALL stock movements and reset inventory quantities.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const transaction = await prisma.$transaction(async (tx) => {
        // 1. Reset office inventory quantities to 0
        await tx.inventoryItem.updateMany({
            data: {
                quantityOnHand: 0,
                reservedQuantity: 0,
            },
        });

        // 2. Reset project stock quantities to 0
        await tx.projectStock.updateMany({
            data: {
                quantityOnSite: 0,
                reservedQuantity: 0,
            },
        });

        // 3. Delete all stock movements
        const deletedMovements = await tx.stockMovement.deleteMany({});
        console.log(`✅ Deleted ${deletedMovements.count} stock movements.`);
    });

    console.log('✅ Cleanup complete. Inventory and project stock have been reset to zero.');
}

cleanup()
    .catch(console.error)
    .finally(() => process.exit());