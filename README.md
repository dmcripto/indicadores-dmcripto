# Indicadores DMCRIPTO (TradingView · Pine Script v6)

Solo indicadores. No dependen de ninguna app ni servidor: se pegan en el editor de Pine de TradingView.

| Archivo | Qué es |
|---|---|
| `dmcripto_order_block.pine` | **DMCRIPTO ORDER BLOCK V3.0** (sobre el gráfico): zonas OB/FVG, estructura, liquidez, perfil de volumen, panel con asistente y señales LONG/SHORT. |
| `dmcripto_oscilador.pine` | **DMCRIPTO OSCILADOR V3.0** (panel aparte): momentum y puntaje que confirman las señales del order block. |
| `dmc_smart_ob_fvg.pine` | Versión ligera anterior: solo zonas OB/FVG (no usar junto al ORDER BLOCK). |
| `ejemplo_niveles_liquidez.txt` | Formato de ejemplo para pegar niveles de liquidación propios. |

## Cómo usarlos

1. Abre el editor de Pine en TradingView, pega el contenido del archivo y pulsa **Añadir al gráfico**.
2. Añade primero el oscilador y luego el order block.
3. En los ajustes del order block, elige las series del oscilador en el grupo de enlace.
   Hay que repetir este paso cada vez que se vuelve a pegar el indicador.

El puente de alertas (`alert()` con JSON) es opcional y se apaga en el grupo "📨 Puente de señales".
