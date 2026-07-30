// assign admin_vam (AD011 แวม) เข้าแผนก HR — owner 2026-07-30 "sidebar ของ hr admin_vam ยังไม่เห็น"
// เซ็ต admin_contact_extras.department='hr' + position_id = ตำแหน่ง "ทรัพยากรบุคคล (HR)" ที่มีอยู่แล้ว
// → gate canViewSystemReports ผ่าน (department='hr'). identity assignment · dry-run+backup.
import { writeFileSync } from "node:fs";
import pg from "pg";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({host:"aws-1-ap-southeast-1.pooler.supabase.com",port:5432,user:"postgres.yzljakczhwrpbxflnmco",password:process.env.SUPABASE_DB_PASSWORD,database:"postgres",ssl:{rejectUnauthorized:false}});
async function main(){
  if(!process.env.SUPABASE_DB_PASSWORD){console.error("SUPABASE_DB_PASSWORD required");process.exit(1);}
  await c.connect();
  const{rows:pr}=await c.query(`SELECT id,member_code,first_name FROM profiles WHERE admin_login_id='admin_vam'`);
  if(!pr.length){console.error("ไม่พบ admin_vam");process.exit(1);}
  const pid=pr[0].id;
  const{rows:pos}=await c.query(`SELECT id,name_th FROM admin_positions WHERE department='hr' AND is_active=true LIMIT 1`);
  if(!pos.length){console.error("ไม่พบตำแหน่งแผนก HR");process.exit(1);}
  const posId=pos[0].id;
  const{rows:before}=await c.query(`SELECT profile_id,department,position_id FROM admin_contact_extras WHERE profile_id=$1`,[pid]);
  console.log(`เป้าหมาย: ${pr[0].member_code} (${pr[0].first_name}) → แผนก HR + ตำแหน่ง "${pos[0].name_th}"`);
  console.log(`  ก่อน: department=${before[0]?.department??'(ไม่มีแถว)'} · position_id=${before[0]?.position_id??'null'}`);
  console.log(`  หลัง: department='hr' · position_id='${posId}'`);
  if(!APPLY){console.log("\n👀 DRY-RUN — เติม --apply เพื่อเขียนจริง");await c.end();return;}
  writeFileSync(`scripts/_backup-vam-hr-${Date.now()}.json`,JSON.stringify(before[0]??{profile_id:pid,department:null,position_id:null},null,2));
  await c.query("BEGIN");
  try{
    await c.query(`INSERT INTO admin_contact_extras (profile_id,department,position_id) VALUES ($1,'hr',$2)
      ON CONFLICT (profile_id) DO UPDATE SET department='hr',position_id=$2`,[pid,posId]);
    await c.query("COMMIT");
    const{rows:after}=await c.query(`SELECT department,position_id FROM admin_contact_extras WHERE profile_id=$1`,[pid]);
    console.log(`✅ เขียนแล้ว: department=${after[0].department} · position_id=${after[0].position_id}`);
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}
  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
