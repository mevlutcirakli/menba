-- 1) Sorunun nereden geldigini isaretler.
--    'ingest' : kaynak islenirken metinden cikarilan gercek soru (varsayilan)
--    'ai'     : konudaki hazir sorular bitince modelin urettigi yeni soru
--
-- Gerekcesi: AI sorulari cevaplanirken questions tablosuna yaziliyor
-- (useQuiz.submitAnswer). Ayrim olmadan konu kartindaki "X soru" sayisi
-- kullanici test cozdukce sisiyor ve ilerleme halkasi geri geri gidiyor.
alter table questions
  add column if not exists origin text not null default 'ingest';

alter table questions
  drop constraint if exists questions_origin_check;

alter table questions
  add constraint questions_origin_check check (origin in ('ingest', 'ai'));

create index if not exists questions_topic_origin_idx
  on questions (topic_id, origin);

-- 2) Eksik DELETE politikalari.
--
-- useSources.deleteSource bu iki tabloda dogrudan delete cagiriyordu ama
-- politika olmadigi icin RLS altinda 0 satir etkileniyor ve HATA DA DONMUYOR:
-- kod "sildim" saniyordu. Veri butunlugunu bugune kadar 0005'teki cascade
-- kurtardi. Politikalar eklenerek acik kapatiliyor.
create policy "Users can delete their question logs"
on question_logs
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can delete their progress"
on user_progress
for delete
to authenticated
using (auth.uid() = user_id);
