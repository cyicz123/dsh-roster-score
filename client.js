/**
 * Client half of the roster-score bundle.
 *
 * One full-page workbench: drop a roster, then the page speaks each student's name,
 * listens for the score, reads it back and moves on by itself. Every confirmed score is
 * written through the Host immediately, so closing the page never loses a value.
 *
 * The page never talks to the model and never fakes a transcript: the Host owns parsing,
 * persistence, export and speech recognition. This file only renders, records audio,
 * speaks with the system voice and drives the loop.
 */
window.__ModuleLoader__.load({
  id: 'dsh-roster-score',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = React

    const NS = 'roster-score'
    const PANEL_ID = 'roster-score'
    const PREFIX = '/plugins/roster-score'
    const SAMPLE_RATE = 16000

    const dict = {
      zh: {
        panel: '成绩录入',
        plugin: '花名册语音录入',
        start: '开始录入',
        resume: '继续录入',
        stop: '停止',
        settings: '设置',
        export: '导出成绩表',
        dropTitle: '把花名册拖到这里',
        dropHint: '支持 .xlsx / .csv，表头里有「姓名」列即可。也可以点击选择文件。',
        choose: '选择文件',
        parsing: '正在解析花名册…',
        ready: '准备就绪',
        listening: '正在听…请报分数',
        speaking: '正在朗读…',
        thinking: '正在识别成绩…',
        finish: '全部录完了',
        current: '当前学生',
        progress: '进度',
        waiting: '等待开始',
        score: '成绩',
        unrecorded: '未录入',
        skipped: '未听清',
        missingMic: '没有可用的麦克风，或浏览器拒绝了麦克风权限。',
        micDenied: '麦克风权限被拒绝：请在 DSH 窗口里允许麦克风后重试。',
        micBusy: '麦克风被其他程序占用，或系统里没有可用的录音设备。',
        micNoDevice: '系统里没有找到麦克风。',
        micUnavailable: '这个窗口不支持麦克风采集。',
        listeningNow: '请说分数',
        autoStart: '名单已就绪，马上开始念名字…',
        missingVoice: '这台电脑没有中文朗读声音，成绩会只显示不朗读。',
        speechSetup: '准备语音识别',
        speechPreparing: '正在准备本地语音模型…',
        speechUnavailable: '当前环境没有语音识别服务。',
        speechFailed: '语音模型准备失败',
        retry: '重试',
        dropAgain: '换一份花名册',
        confirmReplace: '换一份花名册会清空当前成绩，继续吗？',
        columnName: '成绩列名',
        reverse: '倒序录入',
        reverseHint: '表格顺序不变，只是从最后一位开始念。',
        minScore: '最低分',
        maxScore: '最高分',
        readBack: '回读内容',
        readBackBoth: '姓名 + 成绩',
        readBackScore: '只念成绩',
        retries: '没听清时重问',
        retriesUnit: '次',
        retryPrompt: '没听清，请再说一次',
        skippedPrompt: '先跳过这一位',
        rate: '朗读速度',
        clear: '清空已录成绩',
        clearConfirm: '清空后需要重新录，确定吗？',
        close: '关闭',
        saved: '已保存',
        total: '共',
        people: '人',
        recorded: '已录',
        warning: '提示',
        editHint: '点击成绩可修改',
        manual: '手动改成绩',
        voiceCheck: '朗读声库',
        voiceMissing: '未找到中文声库',
        testVoice: '试听',
        testPhrase: '语音测试，八十五分',
        micDevice: '麦克风',
        micPick: '自动（系统默认）',
        micTest: '检测麦克风',
        micTesting: '正在录音 4 秒，请说「八十五」…',
        micPeak: '音量峰值',
        peakShort: '峰值',
        micSilent: '没有收到声音：请检查 Windows 的输入设备，并对着麦克风再说一次。',
        micHeard: '识别结果',
        micHint: '峰值为 0 说明没有采到声音：请在 Windows「设置 → 隐私和安全性 → 麦克风」里允许桌面应用使用麦克风，并在「声音 → 输入」里选对设备。',
      },
      en: {
        panel: 'Scores',
        plugin: 'Roster voice scoring',
        start: 'Start recording',
        resume: 'Resume',
        stop: 'Stop',
        settings: 'Settings',
        export: 'Export scores',
        dropTitle: 'Drop a roster here',
        dropHint: 'A .xlsx or .csv with a name column works. Or click to choose a file.',
        choose: 'Choose file',
        parsing: 'Parsing the roster…',
        ready: 'Ready',
        listening: 'Listening… say the score',
        speaking: 'Speaking…',
        thinking: 'Recognising the score…',
        finish: 'Everyone is recorded',
        current: 'Current student',
        progress: 'Progress',
        waiting: 'Waiting to start',
        score: 'Score',
        unrecorded: 'not recorded',
        skipped: 'not heard',
        missingMic: 'No microphone available, or the browser denied microphone access.',
        micDenied: 'Microphone permission was denied: allow it for this window and retry.',
        micBusy: 'The microphone is busy, or the system has no recording device.',
        micNoDevice: 'No microphone was found on this system.',
        micUnavailable: 'This window cannot capture microphone audio.',
        listeningNow: 'say the score',
        autoStart: 'Roster ready, speaking the first name…',
        missingVoice: 'No Chinese speech voice on this machine; scores are shown but not spoken.',
        speechSetup: 'Prepare speech recognition',
        speechPreparing: 'Preparing the local speech model…',
        speechUnavailable: 'No speech recognition service in this environment.',
        speechFailed: 'The speech model failed to prepare',
        retry: 'Retry',
        dropAgain: 'Load another roster',
        confirmReplace: 'Loading another roster clears the recorded scores. Continue?',
        columnName: 'Score column',
        reverse: 'Record in reverse',
        reverseHint: 'The table keeps its order; speaking starts from the last student.',
        minScore: 'Lowest score',
        maxScore: 'Highest score',
        readBack: 'Read back',
        readBackBoth: 'Name + score',
        readBackScore: 'Score only',
        retries: 'Re-ask when unclear',
        retriesUnit: 'times',
        retryPrompt: 'I did not catch that. Please say the score again.',
        skippedPrompt: 'Skipping this student for now.',
        rate: 'Speaking rate',
        clear: 'Clear recorded scores',
        clearConfirm: 'Clearing makes you record again. Continue?',
        close: 'Close',
        saved: 'Saved',
        total: 'of',
        people: '',
        recorded: 'recorded',
        warning: 'Note',
        editHint: 'Click a score to edit',
        manual: 'Edit score',
        voiceCheck: 'Speech voice',
        voiceMissing: 'No Chinese voice found',
        testVoice: 'Try it',
        testPhrase: 'Voice test, eighty five',
        micDevice: 'Microphone',
        micPick: 'Automatic (system default)',
        micTest: 'Test microphone',
        micTesting: 'Recording for 4 seconds — say "eighty five"…',
        micPeak: 'Peak level',
        peakShort: 'peak',
        micSilent: 'No sound was received: check the Windows input device and try again.',
        micHeard: 'Heard',
        micHint: 'A peak of 0 means no audio is captured: allow desktop apps to use the microphone in Windows Settings → Privacy & security → Microphone, and pick the right device under Sound → Input.',
      },
    }

    let t = (key) => dict.zh[key] || key

    // ---------------------------------------------------------------- utilities

    /* @pure-utils-start */
    const cnDigits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

    function chineseInteger(text) {
      let total = 0
      let current = 0
      let seen = false
      for (const character of text) {
        if (character in cnDigits) {
          current = cnDigits[character]
          seen = true
        } else if (character === '十') {
          total += (current || 1) * 10
          current = 0
          seen = true
        } else if (character === '百') {
          total += (current || 1) * 100
          current = 0
          seen = true
        } else if (character === '千') {
          total += (current || 1) * 1000
          current = 0
          seen = true
        } else {
          return null
        }
      }
      return seen ? total + current : null
    }

    function chineseNumber(text) {
      if (!text) return null
      const [head, tail] = text.split('点')
      let value
      if (/^[零〇一二两三四五六七八九]{2,3}$/.test(head)) {
        value = Number(head.split('').map((character) => cnDigits[character]).join(''))
      } else {
        value = chineseInteger(head)
      }
      if (value === null) return null
      if (tail) {
        const digits = tail.split('').map((character) => (character in cnDigits ? cnDigits[character] : null))
        if (digits.some((digit) => digit === null)) return null
        value = Number(`${value}.${digits.join('')}`)
      }
      return Number.isFinite(value) ? value : null
    }

    /** Pull one plausible score out of what the recogniser heard. */
    function parseScore(text, min, max) {
      if (!text) return null
      const normalized = String(text)
        .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
        .replace(/[．。]/g, '.')
      const accepted = (value) => (Number.isFinite(value) && value >= min && value <= max ? value : null)
      const digitMatches = normalized.match(/\d+(?:\.\d+)?/g) || []
      for (const match of digitMatches) {
        const value = accepted(Number(match))
        if (value !== null) return value
      }
      const candidates = normalized.match(/[零〇一二两三四五六七八九十百点]+/g) || []
      for (const candidate of candidates) {
        const value = accepted(chineseNumber(candidate))
        if (value !== null) return value
      }
      return null
    }
    /* @pure-utils-end */

    function encodeWave(samples) {
      const pcm = new DataView(new ArrayBuffer(samples.length * 2))
      for (let index = 0; index < samples.length; index += 1) {
        const clamped = Math.max(-1, Math.min(1, samples[index]))
        pcm.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      }
      const header = new ArrayBuffer(44)
      const view = new DataView(header)
      const write = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
      }
      write(0, 'RIFF')
      view.setUint32(4, 36 + pcm.byteLength, true)
      write(8, 'WAVE')
      write(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, SAMPLE_RATE, true)
      view.setUint32(28, SAMPLE_RATE * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      write(36, 'data')
      view.setUint32(40, pcm.byteLength, true)
      return concatBytes(new Uint8Array(header), new Uint8Array(pcm.buffer))
    }

    function concatBytes(left, right) {
      const merged = new Uint8Array(left.length + right.length)
      merged.set(left, 0)
      merged.set(right, left.length)
      return merged
    }

    function toBase64(bytes) {
      let text = ''
      const chunk = 8192
      for (let index = 0; index < bytes.length; index += chunk) {
        text += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
      }
      return btoa(text)
    }

    function pickChineseVoice() {
      if (typeof speechSynthesis === 'undefined') return null
      const voices = speechSynthesis.getVoices()
      const chinese = voices.filter((voice) => /^(zh|cmn)/i.test(voice.lang))
      if (chinese.length === 0) return null
      const preferred = chinese.find((voice) => /huihui|yaoyao|kangkang|xiaoxiao|yunxi/i.test(voice.name))
      return preferred || chinese.find((voice) => /zh[-_]cn/i.test(voice.lang)) || chinese[0]
    }

    let voicesReady = null

    function ensureVoices() {
      if (typeof speechSynthesis === 'undefined') return Promise.resolve()
      if (speechSynthesis.getVoices().length > 0) return Promise.resolve()
      if (!voicesReady) {
        voicesReady = new Promise((resolve) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            resolve()
          }
          try {
            speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
          } catch {}
          // A page that never receives `voiceschanged` still has to keep the loop moving.
          setTimeout(finish, 800)
        })
      }
      return voicesReady
    }

    async function speak(text, rate) {
      await ensureVoices()
      return new Promise((resolve) => {
        if (typeof speechSynthesis === 'undefined' || !text) return resolve(false)
        try {
          speechSynthesis.cancel()
        } catch {}
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'zh-CN'
        utterance.rate = Math.max(0.5, Math.min(2, Number(rate) || 1))
        try {
          const voice = pickChineseVoice()
          if (voice) utterance.voice = voice
        } catch {}
        let settled = false
        const finish = (value) => {
          if (settled) return
          settled = true
          resolve(value)
        }
        utterance.onend = () => finish(true)
        utterance.onerror = () => finish(false)
        try {
          speechSynthesis.speak(utterance)
        } catch {
          finish(false)
          return
        }
        // Chromium occasionally never fires `end` when the tab is busy; do not hang the loop.
        setTimeout(() => finish(true), 1500 + text.length * 260 + 4000)
      })
    }

    function stopSpeaking() {
      try {
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
      } catch {}
    }

    /** Chromium fires `end` slightly before the speaker is silent; leave a beat before recording. */
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    function peakText(value) {
      return typeof value === 'number' && value > 0 ? value.toFixed(4) : '0'
    }

    async function api(path, body) {
      const response = await fetch(`${PREFIX}${path}`, body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`服务器返回了无法解析的内容（${response.status}）`)
      }
      if (!response.ok) throw new Error(payload?.error || `请求失败（${response.status}）`)
      return payload
    }

    function readFileBytes(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const buffer = reader.result
          resolve(toBase64(new Uint8Array(buffer)))
        }
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsArrayBuffer(file)
      })
    }

    /**
     * Records one answer. Speech start and a short silence both end it, so the teacher never
     * has to press anything while holding a paper sheet.
     */
    async function recordOnce({
      signal,
      onLevel,
      onState,
      deviceId,
      fixedSeconds = 0,
      stream: provided,
      context: providedContext = null,
    }) {
      // A live track handed over by the loop is reused; otherwise this call owns the device.
      let stream = provided
      let owned = false
      if (!stream || !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        stream = await openMicrophone(deviceId)
        owned = true
      }
      // The loop hands over its context: spinning one up per student costs the first 20-40 ms
      // after the name, which is exactly the silence the teacher complains about.
      const ownContext = !providedContext
      const context = providedContext || new AudioContext()
      const chunks = []
      let recorder = null
      let timer = null
      try {
        // Chromium keeps an AudioContext suspended until the document has a user gesture. The
        // resume is therefore never awaited: a pending promise would stall the whole loop, and
        // a silent analyser only costs the early stop, never the recording itself.
        if (context.state === 'suspended') context.resume().catch(() => {})
        const source = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        const stopped = new Promise((resolve) => {
          recorder.onstop = resolve
        })
        // A slice every 250 ms keeps the buffer populated even when stop arrives abruptly.
        recorder.start(250)
        onState?.('listening')

        const samples = new Float32Array(analyser.fftSize)
        const startedAt = performance.now()
        const floors = []
        let threshold = 0.006
        let speechAt = 0
        let lastLoud = startedAt
        let finished = false
        let vadReady = false
        // Reported back so a silent room is distinguishable from a broken microphone.
        let peak = 0

        const finish = () => {
          if (finished) return
          finished = true
          if (timer) clearInterval(timer)
          if (recorder.state !== 'inactive') recorder.stop()
        }
        const cancel = () => {
          if (finished) return
          finished = true
          if (timer) clearInterval(timer)
          try {
            if (recorder.state !== 'inactive') recorder.stop()
          } catch {}
        }

        timer = setInterval(() => {
          if (finished) return
          const now = performance.now()
          const elapsed = now - startedAt
          const fixedMs = fixedSeconds > 0 ? fixedSeconds * 1000 : 0
          if (fixedMs && elapsed > fixedMs) {
            finish()
            return
          }
          const usable = context.state === 'running'
          if (!vadReady && usable) {
            vadReady = true
            lastLoud = now
          }
          if (!vadReady) {
            // A suspended context reports zero forever, so waiting for silence would mean
            // waiting forever: the window simply closes on time and the clip is still uploaded.
            if (elapsed > 6000) finish()
            return
          }
          analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index]
          const level = Math.sqrt(sum / samples.length)
          if (level > peak) peak = level
          onLevel?.(Math.min(1, level * 12))
          if (fixedMs) return
          // The first 400 ms are assumed to be room noise: a quiet laptop mic often sits
          // far below 0.015, so the trigger follows the measured floor instead of a constant.
          if (floors.length < 8) {
            floors.push(level)
            if (floors.length === 8) {
              const sorted = floors.slice().sort((left, right) => left - right)
              const floor = sorted[Math.floor(sorted.length / 2)]
              threshold = Math.max(0.0035, Math.min(0.05, floor * 3.5))
            }
          } else if (level > threshold) {
            lastLoud = now
            if (!speechAt) speechAt = now
          }
          if (speechAt && now - lastLoud > 900) finish()
          if (!speechAt && elapsed > 6000) finish()
          if (elapsed > 15000) finish()
        }, 50)

        if (signal) {
          if (signal.aborted) cancel()
          else signal.addEventListener('abort', cancel, { once: true })
        }

        await stopped
        if (signal?.aborted) return { empty: true, cancelled: true, peak }
        if (chunks.length === 0) return { empty: true, peak }

        const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
        const bytes = await blob.arrayBuffer()
        // Decoding on the shared context avoids building another one between students.
        let decoded
        try {
          decoded = await context.decodeAudioData(bytes)
        } catch (problem) {
          throw new Error(`录音解码失败（${chunks[0].type || 'audio/webm'}）：${problem?.message || problem}`)
        }
        const seconds = Math.min(decoded.duration, 120)
        if (!(seconds > 0.35)) return { empty: true, peak, seconds }
        const frames = Math.max(1, Math.floor(seconds * SAMPLE_RATE))
        const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE)
        const player = offline.createBufferSource()
        player.buffer = decoded
        player.connect(offline.destination)
        player.start()
        const rendered = await offline.startRendering()
        return { base64: toBase64(encodeWave(rendered.getChannelData(0))), seconds, peak, hadSpeech: Boolean(speechAt) }
      } finally {
        if (timer) clearInterval(timer)
        if (owned) for (const track of stream.getTracks()) track.stop()
        if (ownContext) {
          try {
            await context.close()
          } catch {}
        }
      }
    }

    /**
     * Opens the microphone once for the whole run. Reusing the track keeps the handshake out
     * of the loop, so the first syllable after a name is never spent waiting for the device.
     */
    async function openMicrophone(deviceId) {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        const problem = new Error('micUnavailable')
        problem.code = 'unavailable'
        throw problem
      }
      const audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      }
      if (deviceId) audio.deviceId = { exact: deviceId }
      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: false })
      } catch (problem) {
        // A remembered device may be unplugged; fall back to the system default.
        if (!audio.deviceId) throw problem
        delete audio.deviceId
        return await navigator.mediaDevices.getUserMedia({ audio, video: false })
      }
    }

    /** Turn a DOMException from getUserMedia into something a teacher can act on. */
    function microphoneMessage(problem, translate) {
      const name = problem?.name || ''
      if (name === 'NotAllowedError' || name === 'SecurityError') return translate('micDenied')
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return translate('micNoDevice')
      if (name === 'NotReadableError' || name === 'AbortError') return translate('micBusy')
      if (problem?.code === 'unavailable') return translate('micUnavailable')
      return problem?.message || translate('missingMic')
    }

    // ------------------------------------------------------------------- styles

    const styles = `
      .rs-root { position: relative; box-sizing: border-box; height: 100%; min-height: 0;
        display: flex; flex-direction: column; color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-base); font: var(--dsw-font-s-13, 13px/1.5 system-ui, sans-serif);
        overflow: hidden; }
      .rs-root * { box-sizing: border-box; }
      .rs-head { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l1); min-height: 52px; }
      .rs-title { font: var(--dsw-font-s-strong-13, 600 13px/1.4 system-ui, sans-serif);
        letter-spacing: .02em; white-space: nowrap; }
      .rs-file { color: var(--dsw-alias-label-tertiary); font-size: 12px; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; max-width: 30vw; }
      .rs-spacer { flex: 1; }
      .rs-btn { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 6px 12px; cursor: pointer;
        font: inherit; white-space: nowrap; transition: background .12s ease; }
      .rs-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .rs-btn:disabled { opacity: .45; cursor: default; }
      .rs-btn-primary { background: var(--dsw-alias-state-business-primary, #3b6cf6);
        border-color: transparent; color: #fff; font-weight: 600; }
      .rs-btn-primary:hover:not(:disabled) { opacity: .92; background: var(--dsw-alias-state-business-primary, #3b6cf6); }
      .rs-body { flex: 1; min-height: 0; display: flex; gap: 0; }
      .rs-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 20px 24px 16px;
        gap: 16px; overflow: hidden; }
      .rs-card { flex: none; border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2); border-radius: 18px; padding: 20px 24px 18px;
        display: flex; flex-direction: column; gap: 8px; position: relative; overflow: hidden; }
      .rs-card::after { content: ""; position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent), transparent 60%); }
      .rs-eyebrow { color: var(--dsw-alias-label-tertiary); font-size: 12px; letter-spacing: .16em;
        text-transform: uppercase; }
      .rs-name { font-size: clamp(46px, 8vw, 104px); line-height: 1.02; font-weight: 600;
        letter-spacing: -.02em; overflow-wrap: anywhere; }
      .rs-name-empty { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary)); }
      .rs-phase { display: flex; align-items: center; gap: 20px; font-size: clamp(46px, 8vw, 104px);
        line-height: 1.02; font-weight: 600; letter-spacing: -.02em; color: var(--dsw-alias-label-secondary);
        transition: color .15s ease; }
      .rs-phase .rs-dot { width: 22px; height: 22px; }
      .rs-dot { border-radius: 50%; background: var(--dsw-alias-label-tertiary); flex: none; }
      .rs-phase-listening { color: var(--dsw-alias-state-business-primary); }
      .rs-phase-speaking { color: var(--dsw-alias-label-primary); }
      .rs-phase-thinking { color: var(--dsw-alias-label-secondary); }
      .rs-phase-finish { color: var(--dsw-alias-state-success-primary); }
      .rs-score-row { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
      .rs-score { font-size: clamp(40px, 6vw, 72px); font-weight: 600;
        font-variant-numeric: tabular-nums; color: var(--dsw-alias-state-business-primary); }
      .rs-score-empty { color: var(--dsw-alias-label-tertiary); font-size: 20px; font-weight: 400; }
      .rs-unit { color: var(--dsw-alias-label-tertiary); font-size: 22px; font-weight: 400; }
      .rs-dot-on { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent); }
      .rs-dot-live { background: var(--dsw-alias-state-error-primary); animation: rs-pulse 1.1s ease-in-out infinite; }
      @keyframes rs-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .28; } }
      .rs-transcript { color: var(--dsw-alias-label-tertiary); font-size: 13px; min-height: 18px; }
      .rs-level { height: 4px; border-radius: 999px; background: var(--dsw-alias-border-l1); overflow: hidden; }
      .rs-level > span { display: block; height: 100%; border-radius: inherit;
        background: var(--dsw-alias-state-success-primary); transition: width .08s linear; }
      .rs-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .rs-progress { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }
      .rs-banner { flex: none; border-radius: 10px; padding: 8px 12px; font-size: 12px;
        border: 1px solid var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }
      .rs-banner-error { border-color: var(--dsw-alias-state-error-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
      .rs-table-wrap { flex: 1; min-height: 0; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 14px; overflow: auto; background: var(--dsw-alias-bg-layer-1); }
      .rs-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
      .rs-table th { position: sticky; top: 0; z-index: 2; text-align: left; font-weight: 600;
        font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 9px 12px;
        background: var(--dsw-alias-bg-layer-2); border-bottom: 1px solid var(--dsw-alias-border-l1);
        white-space: nowrap; }
      .rs-table td { padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1);
        white-space: nowrap; max-width: 22vw; overflow: hidden; text-overflow: ellipsis; }
      .rs-table tr:last-child td { border-bottom: none; }
      .rs-table tr.rs-row-now td { background: var(--dsw-alias-interactive-bg-active); }
      .rs-table tr.rs-row-now td:first-child { box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); }
      .rs-num { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; width: 44px; }
      .rs-cell-score { font-variant-numeric: tabular-nums; font-weight: 600; }
      .rs-cell-missing { color: var(--dsw-alias-label-tertiary); font-weight: 400; }
      .rs-cell-skip { color: var(--dsw-alias-state-error-primary); font-weight: 600; }
      .rs-cell-edit { border: 1px solid var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary); border-radius: 6px; width: 74px; padding: 2px 6px; font: inherit; }
      .rs-score-btn { border: none; background: none; color: inherit; font: inherit; cursor: pointer; padding: 0; }
      .rs-drop { flex: 1; min-height: 0; border: 1.5px dashed var(--dsw-alias-border-l2);
        border-radius: 20px; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 12px; text-align: center; padding: 32px;
        color: var(--dsw-alias-label-secondary); transition: border-color .12s, background .12s; }
      .rs-drop-over { border-color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
      .rs-drop h2 { margin: 0; font-size: 22px; font-weight: 600; color: var(--dsw-alias-label-primary); }
      .rs-drop p { margin: 0; max-width: 46ch; line-height: 1.7; font-size: 13px; }
      .rs-ghost { border: none; background: none; color: var(--dsw-alias-brand-primary);
        cursor: pointer; font: inherit; padding: 0; }
      .rs-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: 340px; z-index: 30;
        background: var(--dsw-alias-bg-layer-1); border-left: 1px solid var(--dsw-alias-border-l2);
        box-shadow: var(--dsw-shadow-lv3); display: flex; flex-direction: column;
        transform: translateX(102%); transition: transform .18s ease; }
      .rs-drawer-open { transform: translateX(0); }
      .rs-drawer-head { display: flex; align-items: center; padding: 12px 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .rs-drawer-body { flex: 1; overflow: auto; padding: 16px; display: flex;
        flex-direction: column; gap: 18px; }
      .rs-field { display: flex; flex-direction: column; gap: 6px; }
      .rs-field label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .rs-field-row { display: flex; align-items: center; gap: 10px; }
      .rs-input { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 9px;
        font: inherit; width: 100%; }
      .rs-switch { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .rs-switch input { width: 34px; height: 19px; accent-color: var(--dsw-alias-brand-primary); }
      .rs-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; }
      .rs-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l2); padding: 3px 10px; font-size: 12px;
        color: var(--dsw-alias-label-secondary); }
      @media (max-width: 900px) {
        .rs-drawer { width: 100%; }
        .rs-file { display: none; }
      }
    `

    // ------------------------------------------------------------------ view bits

    function Icon({ size = 22 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M4 6.5h16M4 12h10M4 17.5h7',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 18.2, cy: 15.4, r: 3.4, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M18.2 13.6v1.9l1.3 1', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    function ScoreCell({ record, editing, onBegin, onCommit, onCancel }) {
      const [draft, setDraft] = useState('')
      const cancelled = useRef(false)
      useEffect(() => {
        if (!editing) return
        cancelled.current = false
        setDraft(record.score === null ? '' : String(record.score))
      }, [editing, record.score])
      if (!editing) {
        const text = record.score === null ? (record.skipped ? t('skipped') : '—') : String(record.score)
        const className = record.score === null ? (record.skipped ? 'rs-cell-skip' : 'rs-cell-missing') : 'rs-cell-score'
        return h(
          'button',
          {
            type: 'button',
            className: `rs-score-btn ${className}`,
            title: t('editHint'),
            onClick: () => onBegin(record),
          },
          text,
        )
      }
      return h('input', {
        className: 'rs-cell-edit',
        autoFocus: true,
        value: draft,
        inputMode: 'decimal',
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') onCommit(record, draft)
          if (event.key === 'Escape') {
            cancelled.current = true
            onCancel()
          }
        },
        onBlur: () => {
          if (cancelled.current) return
          onCommit(record, draft)
        },
      })
    }

    function Page(ctx, translate) {
      return function RosterScorePage() {
        const [data, setData] = useState(null)
        const [error, setError] = useState('')
        const [notice, setNotice] = useState('')
        const [phase, setPhase] = useState('idle')
        const [currentId, setCurrentId] = useState(null)
        const [transcript, setTranscript] = useState('')
        const [level, setLevel] = useState(0)
        const [running, setRunning] = useState(false)
        const [settingsOpen, setSettingsOpen] = useState(false)
        const [speech, setSpeech] = useState(null)
        const [preparing, setPreparing] = useState(false)
        const [editingId, setEditingId] = useState(null)
        const [dragging, setDragging] = useState(false)
        const [voiceName, setVoiceName] = useState('')
        const [lastPeak, setLastPeak] = useState(0)
        const [micDevices, setMicDevices] = useState([])
        const [micTesting, setMicTesting] = useState(false)
        const [micResult, setMicResult] = useState('')
        const [deviceId, setDeviceIdState] = useState('')

        const dataRef = useRef(null)
        const runToken = useRef(0)
        const abortRef = useRef(null)
        // Live microphone track kept open for the whole run: reopening it per name costs latency.
        const streamRef = useRef(null)
        const fileInput = useRef(null)
        const autoStarted = useRef(false)
        // The chosen input device survives reloads even when the host has not stored it yet.
        const deviceRef = useRef('')

        useEffect(() => {
          try {
            const saved = window.localStorage.getItem('dsh-roster-score.device-id') || ''
            if (saved) {
              deviceRef.current = saved
              setDeviceIdState(saved)
            }
          } catch {}
        }, [])

        const applyData = useCallback((next) => {
          dataRef.current = next
          setData(next)
          if (next && next.settings) {
            // keep the loop honest about the latest server settings
          }
        }, [])

        useEffect(() => {
          let alive = true
          ;(async () => {
            try {
              const state = await api('/state')
              if (!alive) return
              applyData(state)
              if (!state.empty) {
                const first = nextPending(state)
                setCurrentId(first ? first.id : null)
              }
            } catch (problem) {
              if (alive) setError(problem.message)
            }
            try {
              const snapshot = await api('/speech')
              if (alive) setSpeech(snapshot)
            } catch {}
          })()
          return () => {
            alive = false
            runToken.current += 1
            stopSpeaking()
          }
        }, [applyData])

        // Chromium populates the voice list asynchronously; probe it once and keep the
        // settings drawer in sync so a user without a Chinese voice knows why nothing reads.
        useEffect(() => {
          const refreshVoices = () => {
            const voice = pickChineseVoice()
            setVoiceName(voice ? voice.name : '')
          }
          refreshVoices()
          if (typeof speechSynthesis === 'undefined') return undefined
          speechSynthesis.addEventListener('voiceschanged', refreshVoices)
          return () => speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
        }, [])

        const records = data && !data.empty ? data.records : []
        // `pending` is what the voice loop may still ask; a student parked as "not heard"
        // only waits for a manual fix, so it must not re-enable the start button.
        const missing = records.filter((record) => record.score === null)
        const pending = missing.filter((record) => !record.skipped)
        const recordedCount = records.length - missing.length
        const current = records.find((record) => record.id === currentId) || pending[0] || null

        const speechProvider = useMemo(() => {
          if (!speech || !speech.available) return null
          const list = speech.providers || []
          const selected = speech.selection?.providerId
          return list.find((provider) => provider.id === selected) || list[0] || null
        }, [speech])

        const speechReady = speechProvider && speechProvider.phase === 'ready'

        const refreshSpeech = useCallback(async () => {
          try {
            const snapshot = await api('/speech')
            setSpeech(snapshot)
            return snapshot
          } catch (problem) {
            setError(problem.message)
            return null
          }
        }, [])

        const ensureSpeech = useCallback(async () => {
          let snapshot = await refreshSpeech()
          if (!snapshot || !snapshot.available) throw new Error(translate('speechUnavailable'))
          const selected = snapshot.providers.find((provider) => provider.id === snapshot.selection?.providerId) || snapshot.providers[0]
          if (!selected) throw new Error(translate('speechUnavailable'))
          if (selected.phase === 'ready') return true
          setPreparing(true)
          setPhase('ready')
          try {
            await api('/speech/prepare', { providerId: selected.id })
            for (let attempt = 0; attempt < 240; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
              const next = await refreshSpeech()
              const current = next?.providers.find((provider) => provider.id === selected.id)
              if (current?.phase === 'ready') return true
              if (current?.phase === 'failed') throw new Error(current.message || translate('speechFailed'))
            }
            throw new Error(translate('speechFailed'))
          } finally {
            setPreparing(false)
          }
        }, [refreshSpeech, translate])

        const commitScore = useCallback(async (record, value, skipped) => {
          const next = await api('/score', { id: record.id, score: value, skipped: Boolean(skipped) })
          applyData(next)
          return next
        }, [applyData])

        const loop = useCallback(async () => {
          const token = runToken.current + 1
          runToken.current = token
          const alive = () => runToken.current === token
          setRunning(true)
          setError('')
          setNotice('')
          let held = null
          let audioContext = null
          try {
            await ensureSpeech()
            if (!alive()) return
            try {
              // The device is opened once per run: a per-name handshake would eat the first
              // syllable of every answer.
              held = await openMicrophone(deviceRef.current)
              streamRef.current = held
              audioContext = new AudioContext()
            } catch (problem) {
              throw new Error(microphoneMessage(problem, translate))
            }
            if (!alive()) return
            if (!pickChineseVoice()) setNotice(translate('missingVoice'))
            while (alive()) {
              const snapshot = dataRef.current
              if (!snapshot || snapshot.empty) break
              const target = nextPending(snapshot)
              if (!target) break
              setCurrentId(target.id)
              setPhase('speaking')
              setTranscript('')
              setLastPeak(0)
              await speak(target.name, snapshot.settings.rate)
              if (!alive()) break
              setPhase('listening')

              const controller = new AbortController()
              abortRef.current = controller
              let value = null
              let heard = ''
              let attempt = 0
              const maxRetries = Math.max(0, Number(snapshot.settings.maxRetries) || 0)
              while (attempt <= maxRetries && alive()) {
                if (attempt > 0) {
                  setPhase('speaking')
                  await speak(translate('retryPrompt'), snapshot.settings.rate)
                  if (!alive()) break
                  setPhase('listening')
                }
                setLevel(0)
                let captured
                try {
                  captured = await recordOnce({
                    signal: controller.signal,
                    deviceId: deviceRef.current,
                    stream: streamRef.current,
                    context: audioContext,
                    onLevel: (nextLevel) => setLevel(nextLevel),
                  })
                } catch (problem) {
                  throw new Error(microphoneMessage(problem, translate))
                }
                if (!alive()) break
                setLevel(0)
                setLastPeak(captured?.peak || 0)
                if (!captured || captured.empty) {
                  // Surface the measured level, so a muted device is not mistaken for a bug.
                  setNotice(`${translate('micSilent')}（${translate('peakShort')} ${peakText(captured?.peak)}）`)
                  attempt += 1
                  continue
                }
                // A clip with a real duration but a near-zero peak means the system is not
                // delivering audio; saying so beats silently pretending to listen.
                if ((captured.peak || 0) < 0.002) {
                  setNotice(`${translate('micSilent')}（${translate('peakShort')} ${peakText(captured.peak)}）`)
                } else {
                  setNotice('')
                }
                setPhase('thinking')
                const result = await api('/transcribe', { audioBase64: captured.base64 })
                heard = result.text || ''
                setTranscript(heard)
                value = parseScore(heard, snapshot.settings.minScore, snapshot.settings.maxScore)
                attempt += 1
                if (value !== null) break
              }
              if (!alive()) break
              if (value === null) {
                await commitScore(target, null, true)
                setPhase('speaking')
                await speak(translate('skippedPrompt'), snapshot.settings.rate)
                continue
              }
              await commitScore(target, value, false)
              setPhase('speaking')
              const readBack = snapshot.settings.readBack === 'score'
                ? `${value}分`
                : `${target.name}，${value}分`
              await speak(readBack, snapshot.settings.rate)
            }
            if (alive()) {
              setPhase('finish')
              setCurrentId(null)
            }
          } catch (problem) {
            if (runToken.current === token) setError(problem?.message || String(problem))
          } finally {
            streamRef.current = null
            if (held) for (const track of held.getTracks()) track.stop()
            if (audioContext) {
              try {
                await audioContext.close()
              } catch {}
            }
            if (runToken.current === token) {
              setRunning(false)
              setPhase((previous) => (previous === 'finish' ? previous : 'idle'))
              setLevel(0)
              abortRef.current = null
            }
          }
        }, [commitScore, ensureSpeech, translate])

        const stopLoop = useCallback(() => {
          runToken.current += 1
          abortRef.current?.abort()
          abortRef.current = null
          stopSpeaking()
          setRunning(false)
          setLevel(0)
          setPhase('idle')
        }, [])

        // The teacher holds a paper sheet, so the loop starts on its own as soon as a roster
        // has someone left to record. A manual stop is remembered until the roster changes.
        useEffect(() => {
          if (autoStarted.current) return
          if (!data || data.empty || running) return
          const hasPending = data.records.some((record) => record.score === null && !record.skipped)
          if (!hasPending) return
          autoStarted.current = true
          setNotice(translate('autoStart'))
          // No warm-up wait: every millisecond here is dead time between the file landing and
          // the first name being spoken.
          loop()
        }, [data, running, loop, translate])

        const loadFile = useCallback(async (file) => {
          if (!file) return
          if (dataRef.current && !dataRef.current.empty) {
            const hasScores = dataRef.current.records.some((record) => record.score !== null)
            if (hasScores && !window.confirm(translate('confirmReplace'))) return
          }
          stopLoop()
          setPhase('ready')
          try {
            const dataBase64 = await readFileBytes(file)
            const next = await api('/parse', { fileName: file.name, dataBase64 })
            autoStarted.current = false
            applyData(next)
            setNotice(next.warning || '')
            const first = nextPending(next)
            setCurrentId(first ? first.id : null)
            setPhase('idle')
          } catch (problem) {
            setError(problem.message)
            setPhase('idle')
          }
        }, [applyData, stopLoop, translate])

        const saveSettings = useCallback(async (patch) => {
          try {
            const next = await api('/settings', { settings: { ...dataRef.current?.settings, ...patch } })
            applyData(next)
          } catch (problem) {
            setError(problem.message)
          }
        }, [applyData])

        const chooseDevice = useCallback((value) => {
          deviceRef.current = value
          setDeviceIdState(value)
          try {
            window.localStorage.setItem('dsh-roster-score.device-id', value)
          } catch {}
          saveSettings({ deviceId: value })
        }, [saveSettings])

        const refreshMics = useCallback(async () => {
          if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') return
          const listInputs = async () =>
            (await navigator.mediaDevices.enumerateDevices())
              .filter((device) => device.kind === 'audioinput')
              .map((device, index) => ({
                deviceId: device.deviceId,
                label: device.label || `麦克风 ${index + 1}`,
              }))
          try {
            let devices = await listInputs()
            // Labels stay blank until this page has held one capture permission.
            if (devices.length > 0 && devices.every((device) => !device.label)) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
              for (const track of stream.getTracks()) track.stop()
              devices = await listInputs()
            }
            setMicDevices(devices)
          } catch (problem) {
            setError(microphoneMessage(problem, translate))
          }
        }, [translate])

        const testMicrophone = useCallback(async () => {
          if (micTesting || running) return
          setMicTesting(true)
          setMicResult('')
          setError('')
          setNotice(translate('micTesting'))
          try {
            const captured = await recordOnce({
              deviceId: deviceRef.current,
              fixedSeconds: 4,
              onLevel: (nextLevel) => setLevel(nextLevel),
            })
            setLevel(0)
            const peak = translate('micPeak')
            if (!captured || captured.empty) {
              setNotice('')
              setMicResult(`${translate('micSilent')}（${peak} ${peakText(captured?.peak)}）`)
              return
            }
            const result = await api('/transcribe', { audioBase64: captured.base64 })
            setNotice('')
            if (!result.text) {
              setMicResult(`${translate('micSilent')}（${peak} ${peakText(captured.peak)}）`)
              return
            }
            setMicResult(`${peak} ${peakText(captured.peak)} · ${translate('micHeard')}：${result.text}`)
            // Reading the transcript back proves the whole chain end to end: mic, WAV, model.
            speak(result.text, settingsRef.current?.rate).catch(() => {})
          } catch (problem) {
            setNotice('')
            setMicResult(microphoneMessage(problem, translate))
          } finally {
            setMicTesting(false)
            setLevel(0)
          }
        }, [micTesting, running, translate])

        useEffect(() => {
          if (!settingsOpen) return
          refreshMics()
        }, [settingsOpen, refreshMics])

        const updateScore = useCallback(async (record, draft) => {
          setEditingId(null)
          if (draft === null || draft === '') {
            if (record.score === null) return
            try {
              await commitScore(record, null, false)
            } catch (problem) {
              setError(problem.message)
            }
            return
          }
          try {
            await commitScore(record, draft, false)
          } catch (problem) {
            setError(problem.message)
          }
        }, [commitScore])

        const exportTable = useCallback(async () => {
          try {
            const result = await api('/export', {})
            const binary = atob(result.dataBase64)
            const bytes = new Uint8Array(binary.length)
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
            const blob = new Blob([bytes], { type: 'application/octet-stream' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = result.fileName
            anchor.rel = 'noopener'
            anchor.click()
            setTimeout(() => URL.revokeObjectURL(url), 4000)
          } catch (problem) {
            setError(problem.message)
          }
        }, [])

        const clearScores = useCallback(async () => {
          if (!window.confirm(translate('clearConfirm'))) return
          stopLoop()
          try {
            const next = await api('/reset', {})
            applyData(next)
            const first = nextPending(next)
            setCurrentId(first ? first.id : null)
            setPhase('idle')
          } catch (problem) {
            setError(problem.message)
          }
        }, [applyData, stopLoop, translate])

        const phaseText = (() => {
          if (preparing) return translate('speechPreparing')
          if (phase === 'listening') return translate('listening')
          if (phase === 'speaking') return translate('speaking')
          if (phase === 'thinking') return translate('thinking')
          if (phase === 'finish') return translate('finish')
          if (running) return translate('ready')
          return data && !data.empty ? translate('ready') : translate('waiting')
        })()
        // The stage paints the phase with the same weight as the name, so the state is readable
        // from a metre away, next to a paper sheet.
        const phaseKey = preparing ? 'thinking' : phase || 'idle'

        const columns = useMemo(() => {
          if (!data || data.empty) return []
          const width = Math.max(data.columns?.length || 0, ...data.records.map((record) => record.cells?.length || 0))
          const labels = []
          for (let index = 0; index < width; index += 1) labels.push(data.columns?.[index] || `第${index + 1}列`)
          return labels
        }, [data])

        const body = (() => {
          if (!data) {
            return h('div', { className: 'rs-drop' }, h('h2', null, translate('parsing')))
          }
          if (data.empty) {
            return h(
              'div',
              {
                className: `rs-drop${dragging ? ' rs-drop-over' : ''}`,
                onClick: () => fileInput.current?.click(),
                style: { cursor: 'pointer' },
              },
              h(Icon, { size: 40 }),
              h('h2', null, translate('dropTitle')),
              h('p', null, translate('dropHint')),
              h('button', {
                type: 'button',
                className: 'rs-btn rs-btn-primary',
                onClick: (event) => {
                  event.stopPropagation()
                  fileInput.current?.click()
                },
              }, translate('choose')),
            )
          }
          return h(
            React.Fragment,
            null,
            h(
              'div',
              { className: 'rs-card' },
              h(
                'div',
                { className: 'rs-eyebrow' },
                `${translate('current')}${current ? ` · ${recordedCount} / ${records.length}` : ''}${transcript ? ` · “${transcript}”` : ''}`,
              ),
              h(
                'div',
                { className: `rs-name${current ? '' : ' rs-name-empty'}` },
                current ? current.name || translate('unrecorded') : translate('finish'),
              ),
              h(
                'div',
                { className: `rs-phase rs-phase-${phaseKey}` },
                h('span', {
                  className: `rs-dot${phase === 'listening' ? ' rs-dot-live' : running ? ' rs-dot-on' : ''}`,
                }),
                h('span', null, phaseText),
              ),
              current && current.score !== null
                ? h(
                    'div',
                    { className: 'rs-score-row' },
                    h('span', { className: 'rs-score' }, String(current.score)),
                    h('span', { className: 'rs-unit' }, '分'),
                  )
                : null,
              h('div', { className: 'rs-level' }, h('span', { style: { width: `${Math.round(level * 100)}%` } })),
              h('div', { className: 'rs-hint' }, lastPeak > 0 ? `${translate('peakShort')} ${peakText(lastPeak)}` : ''),
              h(
                'div',
                { className: 'rs-actions' },
                running
                  ? h('button', { type: 'button', className: 'rs-btn', onClick: stopLoop }, translate('stop'))
                  : h('button', {
                      type: 'button',
                      className: 'rs-btn rs-btn-primary',
                      disabled: pending.length === 0,
                      onClick: () => loop(),
                    }, recordedCount > 0 ? translate('resume') : translate('start')),                h('button', { type: 'button', className: 'rs-btn', onClick: exportTable },
                  translate('export')),
                h('button', {
                  type: 'button',
                  className: 'rs-btn',
                  onClick: () => {
                    setSettingsOpen((open) => !open)
                  },
                }, translate('settings')),
                h('span', { className: 'rs-spacer' }),
                h('span', { className: 'rs-progress' },
                  `${translate('recorded')} ${recordedCount} / ${records.length}`),
              ),
            ),
            notice ? h('div', { className: 'rs-banner' }, `${translate('warning')}：${notice}`) : null,
            speech && speech.available === false
              ? h('div', { className: 'rs-banner rs-banner-error' }, translate('speechUnavailable'))
              : null,
            !speechReady && speech?.available && !running
              ? h(
                  'div',
                  { className: 'rs-banner' },
                  h('span', null, preparing ? translate('speechPreparing') : translate('speechSetup')),
                  ' ',
                  h('button', {
                    type: 'button',
                    className: 'rs-ghost',
                    disabled: preparing,
                    onClick: async () => {
                      try {
                        await ensureSpeech()
                        setNotice('')
                      } catch (problem) {
                        setError(problem.message)
                      }
                    },
                  }, preparing ? '…' : translate('retry')),
                )
              : null,
            h(
              'div',
              { className: 'rs-table-wrap' },
              h(
                'table',
                { className: 'rs-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', { className: 'rs-num' }, '#'),
                    h('th', null, '姓名'),
                    h('th', null, data.settings.scoreColumn || translate('score')),
                    h('th', null, '✓'),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  records.map((record, index) =>
                    h(
                      'tr',
                      {
                        key: record.id,
                        className: record.id === currentId ? 'rs-row-now' : '',
                      },
                      h('td', { className: 'rs-num' }, String(index + 1)),
                      h('td', { title: record.name }, record.name || '（空）'),
                      h(
                        'td',
                        null,
                        h(ScoreCell, {
                          record,
                          editing: editingId === record.id,
                          onBegin: (target) => setEditingId(target.id),
                          onCommit: updateScore,
                          onCancel: () => setEditingId(null),
                        }),
                      ),
                      h('td', { className: 'rs-num' }, record.score === null ? '' : '✓'),
                    ),
                  ),
                ),
              ),
            ),
          )
        })()

        return h(
          'div',
          {
            className: 'rs-root',
            onDragOver: (event) => {
              event.preventDefault()
              setDragging(true)
            },
            onDragLeave: () => setDragging(false),
            onDrop: (event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer?.files?.[0]
              if (file) loadFile(file)
            },
          },
          h('style', null, styles),
          h(
            'div',
            { className: 'rs-head' },
            h(Icon),
            h('div', { className: 'rs-title' }, translate('plugin')),
            data && !data.empty ? h('div', { className: 'rs-file' }, data.fileName) : null,
            h('span', { className: 'rs-spacer' }),
            h('span', { className: 'rs-chip' },
              speechReady ? '语音识别就绪' : speech?.available === false ? '无语音识别' : '语音模型未就绪'),
            h('button', {
              type: 'button',
              className: 'rs-btn',
              onClick: () => fileInput.current?.click(),
              disabled: running,
            }, translate('dropAgain')),
          ),
          error ? h('div', { className: 'rs-banner rs-banner-error', style: { margin: '10px 16px 0' } }, error) : null,
          h('input', {
            ref: fileInput,
            type: 'file',
            accept: '.xlsx,.csv,.tsv,.txt',
            style: { display: 'none' },
            onChange: (event) => {
              const file = event.target.files?.[0]
              if (file) loadFile(file)
              event.target.value = ''
            },
          }),
          h('div', { className: 'rs-body' }, h('div', { className: 'rs-stage' }, body)),
          h(
            'aside',
            { className: `rs-drawer${settingsOpen ? ' rs-drawer-open' : ''}` },
            h(
              'div',
              { className: 'rs-drawer-head' },
              h('strong', null, translate('settings')),
              h('span', { className: 'rs-spacer' }),
              h('button', {
                type: 'button',
                className: 'rs-ghost',
                onClick: () => setSettingsOpen(false),
              }, translate('close')),
            ),
            h(
              'div',
              { className: 'rs-drawer-body' },
              h(
                'label',
                { className: 'rs-switch' },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(data?.settings?.reverse),
                  disabled: running || !data || data.empty,
                  onChange: (event) => saveSettings({ reverse: event.target.checked }),
                }),
                h('span', null, translate('reverse')),
              ),
              h('div', { className: 'rs-hint' }, translate('reverseHint')),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, translate('columnName')),
                h('input', {
                  className: 'rs-input',
                  defaultValue: data?.settings?.scoreColumn || '成绩',
                  disabled: running || !data || data.empty,
                  onBlur: (event) => {
                    const value = event.target.value.trim() || '成绩'
                    if (value !== data?.settings?.scoreColumn) saveSettings({ scoreColumn: value })
                  },
                }),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, translate('minScore')),
                h(
                  'div',
                  { className: 'rs-field-row' },
                  h('input', {
                    className: 'rs-input',
                    type: 'number',
                    defaultValue: data?.settings?.minScore ?? 0,
                    disabled: running || !data || data.empty,
                    onBlur: (event) => saveSettings({ minScore: Number(event.target.value) }),
                  }),
                  h('span', { className: 'rs-hint' }, '—'),
                  h('input', {
                    className: 'rs-input',
                    type: 'number',
                    defaultValue: data?.settings?.maxScore ?? 100,
                    disabled: running || !data || data.empty,
                    onBlur: (event) => saveSettings({ maxScore: Number(event.target.value) }),
                  }),
                ),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, translate('readBack')),
                h(
                  'select',
                  {
                    className: 'rs-input',
                    value: data?.settings?.readBack || 'name+score',
                    disabled: running || !data || data.empty,
                    onChange: (event) => saveSettings({ readBack: event.target.value }),
                  },
                  h('option', { value: 'name+score' }, translate('readBackBoth')),
                  h('option', { value: 'score' }, translate('readBackScore')),
                ),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, `${translate('retries')}（${translate('retriesUnit')}）`),
                h('input', {
                  className: 'rs-input',
                  type: 'number',
                  min: 0,
                  max: 5,
                  defaultValue: data?.settings?.maxRetries ?? 2,
                  disabled: running || !data || data.empty,
                  onBlur: (event) => saveSettings({ maxRetries: Number(event.target.value) }),
                }),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, `${translate('rate')}：${data?.settings?.rate ?? 1}`),
                h('input', {
                  type: 'range',
                  min: 0.6,
                  max: 1.6,
                  step: 0.1,
                  defaultValue: data?.settings?.rate ?? 1,
                  disabled: running || !data || data.empty,
                  onChange: (event) => saveSettings({ rate: Number(event.target.value) }),
                }),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, translate('micDevice')),
                h(
                  'div',
                  { className: 'rs-field-row' },
                  h(
                    'select',
                    {
                      className: 'rs-input',
                      value: deviceId,
                      disabled: running,
                      onChange: (event) => chooseDevice(event.target.value),
                    },
                    h('option', { value: '' }, translate('micPick')),
                    micDevices.map((device) =>
                      h('option', { key: device.deviceId, value: device.deviceId }, device.label)),
                  ),
                  h('button', {
                    type: 'button',
                    className: 'rs-ghost',
                    disabled: micTesting || running,
                    onClick: testMicrophone,
                  }, micTesting ? '…' : translate('micTest')),
                ),
                h('div', { className: 'rs-level' }, h('span', { style: { width: `${Math.round(level * 100)}%` } })),
                micResult ? h('div', { className: 'rs-hint' }, micResult) : null,
                h('div', { className: 'rs-hint' }, translate('micHint')),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('label', null, translate('voiceCheck')),
                h(
                  'div',
                  { className: 'rs-field-row' },
                  h('span', { className: 'rs-hint' }, voiceName || translate('voiceMissing')),
                  h('button', {
                    type: 'button',
                    className: 'rs-ghost',
                    onClick: () => speak(translate('testPhrase'), data?.settings?.rate ?? 1),
                  }, translate('testVoice')),
                ),
              ),
              h(
                'div',
                { className: 'rs-field' },
                h('button', {
                  type: 'button',
                  className: 'rs-btn',
                  disabled: running || !data || data.empty,
                  onClick: clearScores,
                }, translate('clear')),
                h('div', { className: 'rs-hint' }, translate('editHint')),
              ),
            ),
          ),
        )
      }
    }

    function nextPending(state) {
      if (!state || state.empty) return null
      // A student marked "not heard" is parked for a manual fix; the loop must not keep
      // returning them, otherwise one unclear answer would stall the whole roster.
      const pending = state.records.filter((record) => record.score === null && !record.skipped)
      if (pending.length === 0) return null
      return state.settings?.reverse ? pending[pending.length - 1] : pending[0]
    }

    // ------------------------------------------------------------------- plugin

    const zh = dict.zh
    const en = dict.en

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        try {
          ctx.locale.register(NS, { zh, en })
          const bound = ctx.locale.bind(NS)
          t = (key) => {
            const value = bound(key)
            return typeof value === 'string' && value !== key ? value : dict.zh[key] || key
          }
        } catch {}

        const PageComponent = Page(ctx, (key) => t(key))

        const disposeIcon = ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 35,
              label: () => t('panel'),
              locale: NS,
            },
            // The Sidebar owns the button: it passes the requested icon edge and whether this
            // panel is the selected one, and dispatches the main panel by this entry id.
            function RosterScoreIcon(owner) {
              const size = owner && typeof owner.size === 'number' ? owner.size : 20
              const active = Boolean(owner && owner.active)
              return h(
                'span',
                {
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: active
                      ? 'var(--dsw-alias-state-business-primary)'
                      : 'var(--dsw-alias-label-secondary)',
                  },
                },
                h(Icon, { size }),
              )
            },
          ))

        const disposePanel = ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
            },
            PageComponent,
          ))

        return () => {
          disposeIcon?.()
          disposePanel?.()
        }
      },
    }
  },
})
