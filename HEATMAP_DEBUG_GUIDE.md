## Diagnosticare Heatmap - Instrucțiuni

### Pasul 1: Verifică serverul
Serverul rulează acum cu log-uri îmbunătățite pe http://localhost:5000

### Pasul 2: Testează upload de imagine
1. Deschide aplicația frontend
2. Loghează-te ca utilizator premium
3. Încarcă o imagine cu score > 40% pentru deepfake
4. Observă log-urile din terminal pentru mesajele de debug

### Mesaje de căutat în log-uri:
- `🔍 Heatmap check:` - Verifică dacă se detectează necesitatea heatmap-ului
- `🎯 Generating heatmap for score` - Confirmă începerea generării
- `🔥 Generating advanced heatmap for premium user...` - Pentru utilizatori premium
- `⚡ Generating standard heatmap for suspicious image...` - Pentru utilizatori anonimi
- `✅ Advanced/Standard heatmap generated:` - Confirmă succesul
- `❌ Heatmap generation failed` - Identifică erorile

### Verificări importante:
1. **Score > 40%**: Doar imaginile cu score > 40% generează heatmap
2. **Utilizator autentificat**: Pentru heatmap premium trebuie să fii logat
3. **Feature activat**: `hasFeature('heatmapGeneration')` trebuie să fie true

### Acțiuni dacă nu apare heatmap:
1. Verifică score-ul imaginii (trebuie > 40%)
2. Verifică statusul autentificării utilizatorului
3. Verifică log-urile pentru erori în HeatmapService
4. Verifică dacă fișierul heatmap se salvează în /public/heatmaps/

### Log-uri de urmărit:
```
🔍 Heatmap check: score=56.7%, shouldGenerate=true, user=premium_user_id, hasFeature=true
🎯 Generating heatmap for score 56.7% (user: premium_user_id)
🔥 Generating advanced heatmap for premium user...
📋 [HEATMAP] Premium options: {...}
🛠️ [HEATMAP] Calling heatmapService.generatePremiumHeatmap...
📊 [HEATMAP] HeatmapService result: {...}
✅ [HEATMAP] Premium heatmap generat cu succes: filename.jpg
✅ Advanced heatmap generated: /heatmaps/filename.jpg
```

Acum încarcă o imagine și observă log-urile!
