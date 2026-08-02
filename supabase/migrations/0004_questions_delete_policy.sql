create policy "Users can delete questions of their topics"
on questions
for delete
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
