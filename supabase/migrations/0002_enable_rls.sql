alter table sources enable row level security;
alter table topics enable row level security;
alter table questions enable row level security;
alter table question_logs enable row level security;
alter table user_progress enable row level security;

create policy "Users can read their sources"
on sources
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their sources"
on sources
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their sources"
on sources
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their sources"
on sources
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can read topics of their sources"
on topics
for select
to authenticated
using (
    exists (
        select 1
        from sources
        where sources.id = topics.source_id
          and sources.user_id = auth.uid()
    )
);

create policy "Users can insert topics to their sources"
on topics
for insert
to authenticated
with check (
    exists (
        select 1
        from sources
        where sources.id = topics.source_id
          and sources.user_id = auth.uid()
    )
);

create policy "Users can update topics of their sources"
on topics
for update
to authenticated
using (
    exists (
        select 1
        from sources
        where sources.id = topics.source_id
          and sources.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from sources
        where sources.id = topics.source_id
          and sources.user_id = auth.uid()
    )
);

create policy "Users can delete topics of their sources"
on topics
for delete
to authenticated
using (
    exists (
        select 1
        from sources
        where sources.id = topics.source_id
          and sources.user_id = auth.uid()
    )
);

create policy "Users can read questions of their topics"
on questions
for select
to authenticated
using (
    exists (
        select 1
        from topics
        join sources on sources.id = topics.source_id
        where topics.id = questions.topic_id
          and sources.user_id = auth.uid()
    )
);

create policy "Users can read their question logs"
on question_logs
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their question logs"
on question_logs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their question logs"
on question_logs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read their progress"
on user_progress
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their progress"
on user_progress
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their progress"
on user_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);