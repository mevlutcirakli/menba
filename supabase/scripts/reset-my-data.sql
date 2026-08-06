-- Menba - tek kullanicinin verisini sifirlar (fresh start).
--
-- NEREDE CALISTIRILIR: Supabase Dashboard > SQL Editor.
--
-- NEDEN TEK SATIR YETIYOR: 0005_topic_delete_cascade.sql ile butun zincir
-- ON DELETE CASCADE:
--     sources -> topics -> questions -> question_logs
--                       -> user_progress
-- Yani kaynaklari silmek konulari, sorulari, cevap loglarini ve ilerleme
-- kayitlarini da goturur. Alt tablolari elle silmeye gerek yok.
--
-- DOKUNULMAYAN: auth.users kaydin. Hesabin durur, yeniden giris yapman
-- gerekmez.
--
-- !!! Asagidaki e-postayi kendi Menba hesabininkiyle degistir. !!!
-- (Uygulamaya giris yaptigin e-posta; Supabase panel hesabin degil.)

delete from sources
where user_id = (
    select id from auth.users
    where email = 'BURAYA_KENDI_EPOSTAN@ornek.com'
);

-- Kontrol: hepsi 0 donmeli.
select
    (select count(*) from sources where user_id = u.id) as kaynak,
    (select count(*) from topics t
        join sources s on s.id = t.source_id
        where s.user_id = u.id) as konu,
    (select count(*) from question_logs where user_id = u.id) as cevap_logu,
    (select count(*) from user_progress where user_id = u.id) as ilerleme
from auth.users u
where u.email = 'BURAYA_KENDI_EPOSTAN@ornek.com';
