-- Legend Finance Hub: database, schemas
use role __ROLE__;
create database if not exists __DB__ comment = 'Legend Biotech finance demo (simulated data)';
create schema if not exists __DB__.FINANCE;
create schema if not exists __DB__.APPS;
