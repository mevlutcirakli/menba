create extension if not exists pgcrypto;

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  content_text text not null,
  source_type text not null default 'custom',
  created_at timestamptz default now()
);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics not null,
  question_text text not null,
  options jsonb not null,
  correct_answer text not null,
  explanation text,
  difficulty smallint default 3,
  created_at timestamptz default now()
);

create table if not exists question_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  question_id uuid references questions not null,
  is_correct boolean not null,
  answered_at timestamptz default now(),
  time_spent_seconds int
);

create table if not exists user_progress (
  user_id uuid references auth.users not null,
  topic_id uuid references topics not null,
  total_attempts int default 0,
  correct_attempts int default 0,
  accuracy numeric generated always as (
    case
      when total_attempts = 0 then 0
      else round(100.0 * correct_attempts / total_attempts, 1)
    end
  ) stored,
  last_attempted_at timestamptz,
  primary key (user_id, topic_id)
);

create or replace function update_user_progress_on_question_log()
returns trigger
language plpgsql
as $$
declare
  v_topic_id uuid;
begin
  select topic_id
    into v_topic_id
  from questions
  where id = new.question_id;

  if v_topic_id is null then
    raise exception 'Question not found for question_id: %', new.question_id;
  end if;

  insert into user_progress (
    user_id,
    topic_id,
    total_attempts,
    correct_attempts,
    last_attempted_at
  )
  values (
    new.user_id,
    v_topic_id,
    1,
    case when new.is_correct then 1 else 0 end,
    new.answered_at
  )
  on conflict (user_id, topic_id)
  do update set
    total_attempts = user_progress.total_attempts + 1,
    correct_attempts = user_progress.correct_attempts + (case when new.is_correct then 1 else 0 end),
    last_attempted_at = new.answered_at;

  return new;
end;
$$;

drop trigger if exists trg_question_logs_update_progress on question_logs;

create trigger trg_question_logs_update_progress
after insert on question_logs
for each row
execute function update_user_progress_on_question_log();
