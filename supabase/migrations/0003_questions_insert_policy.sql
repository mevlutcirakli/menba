create policy "Users can insert questions for their topics"
on questions
for insert
to authenticated
with check (
    exists (
        select 1
        from topics
        join sources on sources.id = topics.source_id
        where topics.id = questions.topic_id
          and sources.user_id = auth.uid()
    )
);