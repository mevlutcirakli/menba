-- Konunun nereden geldigini isaretler.
--   'ingest' : kaynak islenirken AI'in cikardigi konu (varsayilan)
--   'manual' : kullanicinin "Yeni Konu" akisindan elle ekledigi konu
-- Silme yetkisi yalnizca 'manual' konularda acilir; kaynagin kendi konu
-- hiyerarsisi tek tek silinerek bozulmasin.
alter table topics
  add column if not exists origin text not null default 'ingest';

alter table topics
  drop constraint if exists topics_origin_check;

alter table topics
  add constraint topics_origin_check check (origin in ('ingest', 'manual'));
