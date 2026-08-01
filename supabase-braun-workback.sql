-- Upload the workback schedule from the Google doc into the Braun project.
-- Adapted from "Creative Development Phase" → "Event Week" in the source
-- doc, mapped onto Morgan's workback schema. Dates are 2026.
--
-- Run as-is to patch by name (case-insensitive match on "braun"). If you
-- have multiple Braun projects, restrict by org_id or the project id.

update projects
set data = data || jsonb_build_object(
  'workbackSchedule',
  '[
    {"id":"brwb_01","date":"06/09/2026","endDate":"","phase":"Creative Development","name":"Venue Selection","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Venue contract executed","Venue requirements gathered","Initial permitting review begins","Initial floor planning begins"]},
    {"id":"brwb_02","date":"06/18/2026","endDate":"","phase":"Creative Development","name":"R1 Creative Presentation","owner":"ES","status":"Not Started","annotation":"","intro":"Presentation includes:","items":["Initial creative direction","Initial render concepts","Preliminary floor plans","Preliminary A/V concepts","Preliminary rental packages","Preliminary décor concepts","Preliminary signage","Preliminary ROS development","Initial guest journey"]},
    {"id":"brwb_03","date":"06/23/2026","endDate":"","phase":"Creative Development","name":"R1 Feedback Due","owner":"Client","status":"Not Started","annotation":"72-hour review period","intro":"","items":[]},
    {"id":"brwb_04","date":"07/02/2026","endDate":"","phase":"Creative Development","name":"R2 Creative Presentation","owner":"ES","status":"Not Started","annotation":"","intro":"Presentation includes:","items":["Updated rendering","Revised floor plans","Refined A/V recommendations","Refined rental selections","Refined décor selections","Refined signage","Refined ROS development","Budget alignment updates"]},
    {"id":"brwb_05","date":"07/07/2026","endDate":"","phase":"Creative Development","name":"R2 Feedback Due","owner":"Client","status":"Not Started","annotation":"72-hour review period","intro":"","items":[]},
    {"id":"brwb_06","date":"07/10/2026","endDate":"","phase":"Creative Development","name":"Final Creative Presentation","owner":"ES","status":"Not Started","annotation":"","intro":"Presentation includes:","items":["Final renders","Final floor plans","Final A/V package recommendation","Final rental selections","Final décor selections","Final signage","Final ROS development","Budget alignment updates"]},
    {"id":"brwb_07","date":"07/14/2026","endDate":"","phase":"Creative Development","name":"Creative Lock","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Final creative approved","Final floor plans approved","Fabrication begins"]},
    {"id":"brwb_08","date":"07/16/2026","endDate":"","phase":"Production Launch","name":"Initial production orders","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Digital content placement specs share","Initial A/V order submitted","Initial rental order submitted"]},
    {"id":"brwb_09","date":"07/30/2026","endDate":"","phase":"Production Launch","name":"Production orders locked","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Final rental order locked","Final A/V order locked"]},
    {"id":"brwb_10","date":"08/07/2026","endDate":"","phase":"30-Day Lock","name":"Content Files Due","owner":"Client","status":"Not Started","annotation":"","intro":"Content files can include, but are not limited to:","items":["Final logos","Brand assets","Videos","Animations","Presentation files","Product imagery","Approved copy","Any content intended for screens, monitors, LED, kiosks, or printed graphics"]},
    {"id":"brwb_11","date":"08/11/2026","endDate":"","phase":"30-Day Lock","name":"Submissions & approvals","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Fire Marshal submission (pending venue confirmation)","Permit submission (as needed)","Small signage copy finalized","Graphics placement review","Logo placement review"]},
    {"id":"brwb_12","date":"08/15/2026","endDate":"","phase":"Production & Procurement","name":"Final approvals & purchase orders","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Final décor approval","Final purchase orders released","Final large format graphics sent to printer"]},
    {"id":"brwb_13","date":"08/20/2026","endDate":"","phase":"Production & Procurement","name":"Wayfinding signage to print","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Wayfinding + small format signage sent to print"]},
    {"id":"brwb_14","date":"08/27/2026","endDate":"","phase":"Production & Procurement","name":"BA selections finalized","owner":"ES","status":"Not Started","annotation":"","intro":"","items":[]},
    {"id":"brwb_15","date":"08/29/2026","endDate":"","phase":"Production & Procurement","name":"BA talking points approved","owner":"Client","status":"Not Started","annotation":"","intro":"","items":[]},
    {"id":"brwb_16","date":"09/02/2026","endDate":"","phase":"Final Event Prep","name":"BA training & Keep/Toss","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["BA training (Early Spring to lead)","Keep/Toss developed"]},
    {"id":"brwb_17","date":"09/04/2026","endDate":"","phase":"Final Event Prep","name":"Pre-Pro meeting","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["Pre-Pro meeting","ROS review","BA manual review","Keep/Toss finalized"]},
    {"id":"brwb_18","date":"09/08/2026","endDate":"","phase":"Final Event Prep","name":"Know Before You Go email","owner":"ES","status":"Not Started","annotation":"Key event details email sent","intro":"","items":[]},
    {"id":"brwb_19","date":"09/09/2026","endDate":"","phase":"Event Week","name":"Load-In","owner":"ES","status":"Not Started","annotation":"","intro":"","items":["A/V install","Fabrication install","Décor install","Final walkthrough"]},
    {"id":"brwb_20","date":"09/10/2026","endDate":"09/11/2026","phase":"Event Week","name":"Event LIVE","owner":"ES","status":"Not Started","annotation":"","intro":"","items":[]},
    {"id":"brwb_21","date":"09/13/2026","endDate":"","phase":"Event Week","name":"Strike","owner":"ES","status":"Not Started","annotation":"","intro":"","items":[]}
  ]'::jsonb
)
where lower(name) like '%braun%';
