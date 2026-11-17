-- Run once as the Postgres superuser to create the local dev role and databases.
CREATE ROLE voiceretain LOGIN PASSWORD 'voiceretain' CREATEDB;
CREATE DATABASE voiceretain OWNER voiceretain;
CREATE DATABASE voiceretain_test OWNER voiceretain;
