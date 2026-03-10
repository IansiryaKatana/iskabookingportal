-- Seed partners from current partners list (Excel import)
-- Only inserts rows that do not already exist (by referral_code).
-- Partners table: name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code

INSERT INTO public.partners (name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code)
SELECT * FROM (VALUES
  ('Amber Student', NULL, 'contact@amberstudent.com', '+447456741634', 5.00, true, 'Status: Live. Country: UK. Web: Urban Hub, Preston Student Accommodation | Amber', 'AMBERSTUDENT'),
  ('Hoolihome', NULL, 'monica.yang@hoolihome.com', NULL, 5.00, true, 'Status: Live. Country: Beijing, China. Web: Urban Hub-Preston UK Rent - hooli International Student Rental Network', 'HOOLIHOME'),
  ('Casita', NULL, 'contact@casita.com/ rm@casita.com', '+442038718666', 5.00, true, 'Status: Live. Country: Spain. Web: https://www.casita.com/student-accommodation/272485-urban-hub-preston-uk', 'CASITA'),
  ('UniAcco', NULL, 'rahul.chaudhary@uniacco.com', '+448085015198', 5.00, true, 'Status: Live. Country: UK. Web: Urban Hub, Preston Student Accommodation | UniAcco', 'UNIACCO'),
  ('Student.com', NULL, 'tom.bray@student.com', '+448000418764', 5.00, true, 'Status: Live. Country: UK. Web: https://www.student.com/uk/preston/p/urban-hub-2', 'STUDENTCOM'),
  ('Accommodation For Student (AFS)', NULL, 'david.sweeney@accommodationforstudents.com', NULL, 5.00, true, 'Status: Live. Country: UK. Web: https://www.accommodationforstudents.com/student-hall/3847-urban-hub-preston', 'ACCOMMODATIONFORSTUDENTAFS'),
  ('University Living', NULL, 'care@universityliving.com', '2036956785', 5.00, true, 'Status: Live. Country: UK. Web: https://www.universityliving.com/', 'UNIVERSITYLIVING'),
  ('SpareRoom.co.uk', NULL, NULL, NULL, 5.00, true, 'Status: Live. Country: UK. Web: https://student.spareroom.co.uk/accommodation/university_of_central_lancashire/20/17867026/', 'SPAREROOMCOUK'),
  ('Cambridge Education Group', NULL, 'bderrick@oncampus.global', '+44 1223 447761', 5.00, true, 'Status: Referral. Country: UK', 'CAMBRIDGEEDUCATIONGROUP'),
  ('Holdens Estate Agents', NULL, 'jacob@holdens.co.uk', '01772 233380.', 5.00, true, 'Status: Referral. Country: UK. Web: www.holdens.co.uk', 'HOLDENSESTATEAGENTS'),
  ('Campusboard', NULL, 'tom@campusboard.org', NULL, 5.00, true, 'Status: Live. Country: International. Web: Urban Hub | Student Accommodation in Preston', 'CAMPUSBOARD'),
  ('51room', NULL, 'jane.li@51room.com', '+44 20 8191 7567/ +86513 81027651', 5.00, true, 'Status: Live. Country: UK/ China. Web: Urban Hub_ Preston apartments | 51ROOM Overseas Rental', '51ROOM'),
  ('Uhomes', NULL, 'listing@uhomes.com', '+44 207 631 5139', 5.00, true, 'Status: Live. Country: UK. Web: Urban Hub - Preston Student Accommodation | uhomes.com', 'UHOMES'),
  ('Stuliving', NULL, 'info@stuliving.com', '+61333947-8091', 5.00, true, 'Status: Listed - Update pricing already sent and following up. Country: UK/ China. Web: Urban Hub Apartments, Preston Apartments, free booking for Stuliving, stuliving student accommodation', 'STULIVING'),
  ('Fun Living', NULL, 'china@funliving.com', '+400-001-4100', 5.00, true, 'Status: Listed - Update pricing already sent and following up. Country: Beijing, China. Web: Urban Hub International Student Accommodation - Tomato Student Accommodation - Study Abroad, Live Better', 'FUNLIVING'),
  ('Best Student Halls', NULL, 'info@beststudenthalls.com', '+442030958888', 5.00, true, 'Status: Listed - Update pricing already sent and following up. Country: UK. Web: https://www.beststudenthalls.com/uk/preston/urban-hub-preston/', 'BESTSTUDENTHALLS'),
  ('Belloliving', NULL, 'info@belloliving.cn', '+400 181 5750', 5.00, true, 'Status: Listed - Update pricing already sent and following up. Country: UK/ China. Web: Urban Hub - Preston | 8th Floor School Building - BelloLiving.cn', 'BELLOLIVING'),
  ('Bookmyuniroom', NULL, 'enquire@bookmyuniroom.com', '+447462284010', 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: Student Accommodation in Urban Hub Preston, Rooms, Apartment', 'BOOKMYUNIROOM'),
  ('DA Photiades Education Limited', NULL, 'info-edu@photiades.ac.cy', '+35722100116', 5.00, true, 'Status: Contacted and waiting for response. Country: Cyprus. Web: https://www.photiades.ac.cy/en/', 'DAPHOTIADESEDUCATIONLIMITED'),
  ('EIC Education Group', NULL, 'marketing.uk@eiceducation.com', '+852-2736-0036', 5.00, true, 'Status: Contacted and waiting for response. Country: Hong Kong. Web: https://partners.eic.org.cn/', 'EICEDUCATIONGROUP'),
  ('Hybr', NULL, NULL, '+44 20 3696 4594', 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: https://dashboard.hybr.co.uk/marketing/students', 'HYBR'),
  ('Leverage EduMioliving', NULL, 'hello@leverageedu.com', '+1800-572-000', 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: https://leverageedu.com/', 'LEVERAGEEDUMIOLIVING'),
  ('Uoffer Global', NULL, 'partnership@uofferglobal.com', '+010-53689191', 5.00, true, 'Status: Contacted and waiting for response. Country: Beijing, China. Web: https://www.uofferglobal.com/en', 'UOFFERGLOBAL'),
  ('Daniel Global Education Services Limited', NULL, 'enquiry@daniel-edu.co.uk', '+441618209969', 5.00, true, 'Status: Contacted and waiting for response. Country: UK/ China. Web: http://www.daniel-edu.co.uk/', 'DANIELGLOBALEDUCATIONSERVICESL'),
  ('Rightmove Student', NULL, NULL, NULL, 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: https://www.rightmove.co.uk/student-accommodation/London.html', 'RIGHTMOVESTUDENT'),
  ('UniHomes', NULL, 'jack.lucas@unihomes.co.uk', '0330 822 0266', 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: https://www.unihomes.co.uk/', 'UNIHOMES'),
  ('Student housemates', NULL, 'support@studenthousemates.com', '+448000789659', 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: Contact Us - Student Housemates', 'STUDENTHOUSEMATES'),
  ('Zoopla Student', NULL, 'members@zoopla.co.uk', NULL, 5.00, true, 'Status: Contacted and waiting for response. Country: UK. Web: https://www.zoopla.co.uk/', 'ZOOPLASTUDENT'),
  ('Chris Living', NULL, NULL, NULL, 5.00, true, 'Status: no contact on website. Country: China. Web: https://www.chrisliving.com', 'CHRISLIVING'),
  ('Golden Arrow Education Group', NULL, 'THEStudent.commercial@timeshighereducation.com', NULL, 5.00, true, 'Status: website not working. Country: China. Web: https://www.timeshighereducation.com/student/student-services/golden-arrow-overseas-consulting', 'GOLDENARROWEDUCATIONGROUP'),
  ('UZILiving', NULL, 'zhiqing.pan@uziliving.com', '+862154716692', 5.00, true, 'Status: only in chinese. Country: China. Web: https://www.uziliving.com/student_apartment?type=1&keyword=%E4%B8%AD%E5%A4%AE%E5%85%B0%E5%BC%80%E5%A4%8F%E5%A4%A7%E5%AD%A6&college=404', 'UZILIVING'),
  ('Hino Student', NULL, 'Yuhas@hinostudent.com', NULL, 5.00, true, 'Status: no website. Country: China & UK. Web: Urban Hub-海外租房-HinoStudent', 'HINOSTUDENT')
) AS v(name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code)
WHERE NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.referral_code = v.referral_code);
