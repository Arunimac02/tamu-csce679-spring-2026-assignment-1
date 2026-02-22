const svg = d3.select("#matrixSvg");
const tooltip = d3.select("#tooltip");

const margin = { top: 26, right: 165, bottom: 20, left: 58 };
const cellSize = { w: 74, h: 46 };

const months = d3.range(1, 13);
const monthLabel = d3.timeFormat("%B");
const shortMonth = d3.timeFormat("%Y-%m");

// Top (0 C) -> bottom (40 C), matching the stepped example bar.
const palette = [
  "#6b66b8",
  "#4f8fcd",
  "#5fbec0",
  "#8ed08e",
  "#d4e392",
  "#f2efba",
  "#efc66e",
  "#f2a556",
  "#ef6b47",
  "#d93d58",
  "#b1005f",
];

let viewMode = "max";
let state = null;

function parseRow(row) {
  return {
    date: d3.timeParse("%Y-%m-%d")(row.date),
    max: +row.max_temperature,
    min: +row.min_temperature,
  };
}

function monthName(monthNum) {
  return monthLabel(new Date(2000, monthNum - 1, 1));
}

function buildVerticalLegend(parent, x, y, width, height) {
  const g = parent.append("g").attr("transform", `translate(${x},${y})`);
  const blockH = height / palette.length;

  g.selectAll("rect.legend-step")
    .data(palette)
    .join("rect")
    .attr("class", "legend-step")
    .attr("x", 0)
    .attr("y", (_, i) => i * blockH)
    .attr("width", width)
    .attr("height", blockH)
    .attr("fill", (c) => c);

  g.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "none")
    .attr("stroke", "#5a5a5a")
    .attr("stroke-width", 0.8);

  g.append("text").attr("class", "legend-label").attr("x", width + 8).attr("y", 9).text("0 Celsius");
  g
    .append("text")
    .attr("class", "legend-label")
    .attr("x", width + 8)
    .attr("y", height)
    .attr("dominant-baseline", "ideographic")
    .text("40 Celsius");
}

function render() {
  svg.selectAll("*").remove();

  const years = state.years;
  const plotWidth = years.length * cellSize.w;
  const plotHeight = months.length * cellSize.h;
  const totalWidth = margin.left + plotWidth + margin.right;
  const totalHeight = margin.top + plotHeight + margin.bottom;

  svg.attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(years)
    .range([0, plotWidth])
    .paddingInner(0.12)
    .paddingOuter(0.02);

  const y = d3
    .scaleBand()
    .domain(months)
    .range([0, plotHeight])
    .paddingInner(0.2)
    .paddingOuter(0.02);

  const colorValue = viewMode === "max" ? "monthMax" : "monthMin";

  // 0-40 C mapped to palette bins to match legend blocks exactly.
  const colorScale = d3.scaleQuantize().domain([0, 40]).range(palette);

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisTop(x).tickSize(0))
    .call((sel) => sel.select(".domain").remove())
    .call((sel) => sel.selectAll("text").attr("dy", "-0.45em"));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickSize(0).tickFormat((m) => monthName(m)))
    .call((sel) => sel.select(".domain").remove());

  const cells = g
    .selectAll("g.cell")
    .data(state.monthly)
    .join("g")
    .attr("class", "cell")
    .attr("transform", (d) => `translate(${x(d.year)},${y(d.month)})`)
    .on("mouseenter", (event, d) => {
      if (!d.hasData) {
        tooltip
          .style("visibility", "visible")
          .html(`<strong>Date: ${d.year}-${String(d.month).padStart(2, "0")}</strong><br>No data available`);
        return;
      }

      tooltip.style("visibility", "visible").html(
        `<strong>Date: ${shortMonth(d.days[0].date)}</strong>, max: ${d.monthMax.toFixed(1)} min: ${d.monthMin.toFixed(1)}`
      );
    })
    .on("mousemove", (event) => {
      const box = svg.node().getBoundingClientRect();
      tooltip
        .style("left", `${event.clientX - box.left + 12}px`)
        .style("top", `${event.clientY - box.top + 12}px`);
    })
    .on("mouseleave", () => {
      tooltip.style("visibility", "hidden");
    })
    .on("click", () => {
      viewMode = viewMode === "max" ? "min" : "max";
      tooltip.style("visibility", "hidden");
      render();
    });

  cells
    .append("rect")
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => (d.hasData ? colorScale(d[colorValue]) : "#d4d7ce"));

  const lineGen = d3
    .line()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(d3.curveMonotoneX);

  cells.each(function (d) {
    if (!d.hasData) {
      return;
    }

    const group = d3.select(this);
    const innerW = x.bandwidth();
    const innerH = y.bandwidth();

    let low = d3.min(d.days, (p) => p.min);
    let high = d3.max(d.days, (p) => p.max);

    if (low === high) {
      low -= 1;
      high += 1;
    }

    const sx = d3.scaleLinear().domain([1, 31]).range([2, innerW - 2]);
    const sy = d3.scaleLinear().domain([low, high]).range([innerH - 2, 2]);

    const maxPoints = d.days.map((p) => ({ x: sx(p.day), y: sy(p.max) }));
    const minPoints = d.days.map((p) => ({ x: sx(p.day), y: sy(p.min) }));

    group.append("path").attr("class", "spark-max").attr("d", lineGen(maxPoints));
    group.append("path").attr("class", "spark-min").attr("d", lineGen(minPoints));
  });

  buildVerticalLegend(svg, margin.left + plotWidth + 28, margin.top + 18, 16, 190);
}

function preprocess(rows) {
  const byMonth = d3.rollup(
    rows,
    (arr) => {
      arr.sort((a, b) => d3.ascending(a.date, b.date));
      return {
        year: arr[0].date.getFullYear(),
        month: arr[0].date.getMonth() + 1,
        meanMax: d3.mean(arr, (d) => d.max),
        meanMin: d3.mean(arr, (d) => d.min),
        monthMax: d3.max(arr, (d) => d.max),
        monthMin: d3.min(arr, (d) => d.min),
        days: arr.map((d) => ({ day: d.date.getDate(), max: d.max, min: d.min, date: d.date })),
      };
    },
    (d) => `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}`
  );

  const years = d3.range(2008, 2018);
  const monthly = [];

  years.forEach((year) => {
    months.forEach((month) => {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const bucket = byMonth.get(key);

      if (bucket) {
        monthly.push({ ...bucket, hasData: true });
      } else {
        monthly.push({ year, month, hasData: false, days: [] });
      }
    });
  });

  state = { years, monthly };
}

async function run() {
  const raw = await d3.csv("temperature_daily.csv", parseRow);
  const tenYears = raw.filter((d) => d.date.getFullYear() >= 2008 && d.date.getFullYear() <= 2017);

  preprocess(tenYears);
  render();
}

run().catch((err) => {
  console.error(err);
  d3.select(".viz-wrap")
    .append("p")
    .style("color", "#b00020")
    .style("padding", "8px")
    .text("Failed to load or render data. Check browser console for details.");
});

