# Plano de Correção: Rastreamento em Segundo Plano e Trajeto Real

Plano detalhado para corrigir o congelamento das métricas (km, ritmo/pace e calorias) na tela de bloqueio e tela desligada no Android com Google Chrome, e resolver a distorção do trajeto no Story Generator para reproduzir com exatidão a rota percorrida.

---

### Decisões Críticas e Preferências do Usuário

> [!IMPORTANT]
> **Dispositivo e Cenário Confirmados**: Android com Google Chrome executando treino com tela desligada / bloqueada.
> **Comportamento Solicitado**:
> 1. Rastreamento contínuo das métricas reais (Km, Ritmo/Pace, Calorias e Tempo) na tela de bloqueio e em segundo plano com tela apagada.
> 2. Desenho do trajeto 100% fiel à caminhada/corrida real no Story (sem criar circuitos aleatórios ou distorcer trajetos em linha reta).

- **Métricas na Tela de Bloqueio**: O MediaSession API precisa ser alimentado via tick em segundo plano vinculado ao áudio contínuo silencioso (Web Audio Oscillator/Buffer keep-alive ativo), garantindo que os temporizadores não sejam estrangulados (*throttled*) pelo Chrome no Android quando a tela for bloqueada.
- **Rastreamento Geográfico Real no Story**: O StoryGenerator atualmente recorre a coordenadas simuladas do Parque Ibirapuera (`SAMPLE_ROUTE_COORDS`) quando o array de coordenadas reais estiver incompleto ou quando a seleção do treino não for propagada imediatamente. Corrigiremos para utilizar estritamente as coordenadas do treino real recém-concluído e normalizar retas e trajetos sem distorção angular.

---

### 1. Visão Geral e Conceito

O aplicativo deve manter total confiabilidade esportiva no Android:
1. Quando o corredor bloqueia ou desliga a tela do celular, o treino continua computando distância, velocidade instantânea, ritmo médio (pace) e calorias em tempo real. A notificação de mídia na tela de bloqueio reflete esses números dinamicamente (`0.85 km · 5'40"/km · 62 kcal`).
2. Ao finalizar o treino e clicar para gerar o Story para Instagram/WhatsApp, o trajeto exibido na estampa laranja é rigorosamente o polígono/linha percorrida pelo GPS, preservando sua proporção e orientação no espaço geográfico real.

---

### 2. Diagnóstico dos Problemas Identificados

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CAUSAS IDENTIFICADAS                          │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Congelamento na Tela Desligada (Android Chrome):                    │
│    - setInterval no JS é congelado pelo navegador em segundo plano    │
│    - O Geolocation watchPosition depende de ciclo ativo                │
│    - O MediaMetadata era atualizado apenas sob render do React,        │
│      que é suspenso quando o DOM entra em 'hidden'                     │
│                                                                        │
│ 2. Trajeto "Doido" ou Aleatório no Story:                              │
│    - Se coordinates.length < 2, StoryGenerator chamava fallback       │
│      SAMPLE_ROUTE_COORDS (circuito de teste do Ibirapuera)             │
│    - A função projectCoordinatesToCanvas ampliava micro-ruídos         │
│      laterais de GPS em caminhadas retas (ex: caminhada norte-sul      │
│      com jitter de 2 metros no eixo leste-oeste era esticada para      │
│      ocupar toda a largura da tela como um zigue-zague)                │
│    - Ao clicar em "Story" logo após finalizar, o estado do último      │
│      treino no App.tsx precisava de sincronização imediata             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Decisões Técnicas e Soluções Arquiteturais

#### A. Keep-Alive Robusto para Android Background & Tela de Bloqueio
- **Loop de Áudio DSP + Geolocation Worker**: O motor de áudio (`audioEngine.ts`) já possui keep-alive via Web Audio API. Vislumbraremos um loop de batimento periódico no contexto do áudio (`AudioContext` não sofre throttle agressivo do Chrome móvel se o stream de som de fundo estiver rodando).
- **Atualização Direta do MediaSession**: Em vez de depender do ciclo de renderização do React (`useEffect([distance, pace, calories])`), o `GPSRunner` sincronizará a notificação de mídia diretamente na chegada de novos dados de GPS e em cada segundo do relógio de fundo.
- **WakeLock API com Reconexão**: Garantir que o WakeLock se restabeleça automaticamente no evento `visibilitychange`.

#### B. Projeção Cartográfica Fiel para Linhas Retas e Qualquer Rota
- **Cálculo de Proporção Real (Aspect Ratio Real)**: Na função `projectCoordinatesToCanvas` de `geo.ts`:
  - Se a variação de longitude ou latitude for mínima (ex: caminhada em linha reta norte-sul onde $\Delta \text{lng} \approx 0$), o sistema não deve esticar o ruído de GPS de 2 metros para cobrir toda a largura do Story.
  - Fixar um limiar de amplitude mínima angular baseado na distância real percorrida. Se a amplitude lateral for ruído de GPS em relação à distância percorrida, desenhar uma reta natural proporcional e centralizada.
- **StoryGenerator com Prioridade Absoluta ao Treino Concluído**:
  - Eliminar qualquer substituição silenciosa por rota simulada quando existir um treino ativo ou recém-finalizado.
  - Se o treino tiver poucos pontos de GPS (ex: 2 a 5 pontos em linha reta), desenhar exatamente esses pontos e a trajetória correspondente.

---

### 4. Diagrama da Arquitetura de Rastreamento

```
┌────────────────────────────────────────────────────────────────────────┐
│                       FLUXO DE BACKGROUND TRACKING                     │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌──────────────────┐            ┌──────────────────┐
       │ AudioEngine      │            │ Geolocation API  │
       │ Keep-Alive Loop  │            │ watchPosition    │
       │ (Android Chrome) │            │ (alta precisão)  │
       └────────┬─────────┘            └────────┬─────────┘
                │                               │
                └───────────────┬───────────────┘
                                ▼
                   ┌──────────────────────────┐
                   │ GPS State Controller     │
                   │ - Distância acumulada    │
                   │ - Ritmo / Pace instant.  │
                   │ - Calorias dinâmicas     │
                   └────────────┬─────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ MediaSession API (Lockscreen) │       │ Story Generator Canvas        │
│ "0.92 km · 5'45"/km · 68 kcal"│       │ Projeção métrica real 1:1     │
│ Atualizado mesmo com tela off │       │ Sem esticar jitter de GPS     │
└───────────────────────────────┘       └───────────────────────────────┘
```

---

### 5. Plano de Execução Passo a Passo

1. **`src/utils/geo.ts`**:
   - Refinar a projeção cartográfica `projectCoordinatesToCanvas` para calcular o aspect ratio métrico real usando projeção de Mercator / Equirretangular ajustada pela latitude.
   - Tratar trajetos lineares (norte-sul, leste-oeste ou diagonais) garantindo que caminhadas retas permaneçam visualmente retas, sem ampliação desmedida de variações microscópicas de GPS.
2. **`src/services/audioEngine.ts`**:
   - Fortalecer o gerador keep-alive para manter a thread de áudio ativa ininterruptamente no Chrome Android com loop contínuo e callbacks pontuais para atualização do `navigator.mediaSession.metadata`.
3. **`src/components/GPSRunner.tsx`**:
   - Vincular os cálculos de tempo, distância e calorias a marcas de tempo absolutas (`performance.now()` / `Date.now()`) para compensar qualquer intervalo entre acordadas de CPU do Android.
   - Atualizar a notificação da tela de bloqueio de forma autônoma sem esperar por re-render da tela.
   - Garantir que ao finalizar o treino, as coordenadas exatas coletadas sejam salvas e transmitidas ao gerador de Story.
4. **`src/components/StoryGenerator.tsx`**:
   - Garantir que ao abrir o gerador a partir de um treino finalizado, a rota laranja desenhada seja única e exclusivamente a rota real salva no treino.
   - Remover fallbacks que geravam rotas aleatórias/simuladas do Ibirapuera em treinos reais.
5. **Validação e Compilação**:
   - Testar cálculos com simulações de rota reta (norte-sul e leste-oeste) e validar compilação sem erros via `compile_applet`.
