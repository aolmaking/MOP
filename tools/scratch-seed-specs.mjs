import { PrismaClient } from '../packages/database/generated/client/index.js';

const p = new PrismaClient();

async function main() {
  const t = await p.tenant.findUnique({ where: { slug: 'apex-motors' } });
  if (!t) throw new Error('Apex motors not found');

  const teams = await p.team.findMany({ where: { tenantId: t.id } });
  console.log('Found teams:', teams.map(x => ({ id: x.id, name: x.name })));

  if (teams.length > 0) {
    await p.team.update({
      where: { id: teams[0].id },
      data: { specializations: ['Brake System & ABS', 'Engine Powertrain', 'Transmission & Gearbox'] }
    });
    console.log(`Updated team ${teams[0].name} with specializations`);
  }

  const staff = await p.staffUser.findMany({ where: { tenantId: t.id, role: 'TECHNICIAN' } });
  console.log('Found techs:', staff.map(x => ({ id: x.id, name: x.fullName })));

  if (staff.length > 0) {
    await p.staffUser.update({
      where: { id: staff[0].id },
      data: { specializations: ['Suspension & Struts', 'Steering System & Alignment'] }
    });
    console.log(`Updated technician ${staff[0].fullName} with specializations`);
  }

  const wos = await p.workOrder.findMany({
    where: { tenantId: t.id },
    include: { tasks: true },
    take: 5
  });
  console.log(`Found ${wos.length} work orders to attach tasks to`);
  if (wos.length > 0) {
    if (wos[0].tasks.length === 0) {
      await p.task.create({
        data: {
          tenantId: t.id,
          workOrderId: wos[0].id,
          title: 'Front brake pad and ABS rotor inspection',
        }
      });
      console.log(`Created brake task on work order ${wos[0].id}`);
    } else {
      await p.task.update({
        where: { id: wos[0].tasks[0].id },
        data: { title: 'Front brake pad and ABS rotor inspection' }
      });
      console.log(`Updated task on work order ${wos[0].id}`);
    }
  }
  if (wos.length > 1) {
    if (wos[1].tasks.length === 0) {
      await p.task.create({
        data: {
          tenantId: t.id,
          workOrderId: wos[1].id,
          title: 'Front suspension struts and steering alignment',
        }
      });
      console.log(`Created suspension task on work order ${wos[1].id}`);
    } else {
      await p.task.update({
        where: { id: wos[1].tasks[0].id },
        data: { title: 'Front suspension struts and steering alignment' }
      });
      console.log(`Updated task on work order ${wos[1].id}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
