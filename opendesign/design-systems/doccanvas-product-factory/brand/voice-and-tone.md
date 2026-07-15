---
title: Voice and Tone
updated: 2026-07-15
---

# Voice and Tone

## Voice

DocCanvas speaks like a calm factory operator: precise, warm, evidence-aware, and action-oriented. It explains what a room owns, what enters it, what it produces, and what remains unverified.

## Product copy rules

- Use concise Chinese sentence case for headings and actions.
- Name an object before its state: `画布已保存`, `PNG 导出失败`.
- Keep labels concrete: `保存视图`, `适应建筑`, `返回整栋工厂`.
- Preserve source provenance with `来源：` and the cleaned source heading.
- Distinguish `生产只读`, `待验证`, and actual runtime states. Never label a synthetic employee `在线` without a runtime signal.
- Failure messages state the failed action and the next safe action; they do not silently fall back.
- Do not use emoji, exclamation marks for routine success, or anthropomorphic claims such as “员工正在思考” unless an agent runtime actually reports that state.

## Numbers and names

- Stage labels use `STAGE 01`–`STAGE 08`; capability rooms use `MODULE 01`–`MODULE 08`.
- Counts use Arabic numerals and explicit units: `12 个节点`, `3 项资源`.
- Digital employee names are synthetic presentation identities. Always show the role title nearby.
