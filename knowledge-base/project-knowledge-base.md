# Flagship Resume ATS — Project Knowledge Base

> **Last Updated:** 2026-06-29
> **Status:** Live on Render ✅ — x402scan ✅ Registered
> **Repo:** https://github.com/pgentles/flagship-resume-ats
> **Live URL:** https://flagship-resume-ats.onrender.com

---

## 1. Executive Summary

Flagship Resume ATS is an AI-powered resume optimization API. It analyzes resumes against ATS formatting rules, tailors content to job descriptions, and provides keyword matching scores.

## 2. Endpoints

### Paid
| Endpoint | Price (USDC) | Input |
|----------|-------------|-------|
| POST /api/analyze | 0.05 | {resume} |
| POST /api/tailor | 0.10 | {resume, jobDescription} |
| POST /api/score | 0.03 | {resume, jobDescription} |

### Free
| Endpoint | Purpose |
|----------|---------|
| GET /api/formats | ATS-safe formatting rules |
| GET /api/keywords | Industry keyword database |
| GET /api/sales | Transaction count |

## 3. Features

- 10 ATS formatting rules (headers, fonts, spacing, etc.)
- 7 industry keyword databases (70+ keywords each): Technology, Finance, Healthcare, Marketing, Sales, Education
- Resume tailoring based on job description
- Quick match scoring
- Industry auto-detection

## 4. Architecture

Single-file Express server with x402 v2 middleware. Same pattern as all Flagship services.
