@echo off
rem Double-click this file: it runs setup-local-mongodb.ps1 with administrator rights.
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0setup-local-mongodb.ps1""'"
