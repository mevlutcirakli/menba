-- Konu silinebilsin diye alt kayitlar otomatik temizlensin.
-- Onceden foreign key'ler ON DELETE kurali tasimadigi icin bir konuyu
-- silmek, sorulari ve o sorulara ait loglari elle silmeden mumkun degildi.

alter table questions
  drop constraint if exists questions_topic_id_fkey;

alter table questions
  add constraint questions_topic_id_fkey
  foreign key (topic_id) references topics (id) on delete cascade;

alter table question_logs
  drop constraint if exists question_logs_question_id_fkey;

alter table question_logs
  add constraint question_logs_question_id_fkey
  foreign key (question_id) references questions (id) on delete cascade;

alter table user_progress
  drop constraint if exists user_progress_topic_id_fkey;

alter table user_progress
  add constraint user_progress_topic_id_fkey
  foreign key (topic_id) references topics (id) on delete cascade;

alter table topics
  drop constraint if exists topics_source_id_fkey;

alter table topics
  add constraint topics_source_id_fkey
  foreign key (source_id) references sources (id) on delete cascade;
