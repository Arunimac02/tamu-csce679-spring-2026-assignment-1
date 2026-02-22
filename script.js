const svg = d3.select("#matrixSvg");
const tooltip = d3.select("#tooltip");

const margin = { top: 34, right: 190, bottom: 52, left: 72 };
const cellWidth = 82;
const cellHeight = 58;

const months = d3.range(1, 13);
const monthLabel = d3.timeFormat("%b");
const fullDate = d3.timeFormat("%Y-%m-%d");

let viewMode = "max";
let state = null;

const fmt1 = d3.format(".1f");

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

function makeLegend(parent, colorScale, legendX, legendY, width, height, title) {
  const defs = parent.append("defs");
  const gradId = `legend-gradient-${viewMode}`;
  const gradient = defs
    .append("linearGradient")
    .attr("id", gradId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  const [v0, v1] = colorScale.domain();
  const stops = d3.range(0, 1.01, 0.1);
  stops.forEach((t) => {
    gradient
      .append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(v0 + (v1 - v0) * t));
  });

  const g = parent.append("g").attr("transform", `translate(${legendX}, ${legendY})`);
  g.append("text").attr("class", "legend-title").attr("x", 0).attr("y", -10).text(title);

  g.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", `url(#${gradId})`)
    .attr("stroke", "#808b78")
    .attr("stroke-width", 1);

  const legendScale = d3.scaleLinear().domain(colorScale.domain()).range([0, width]);
  const legendAxis = d3.axisBottom(legendScale).ticks(5);
  g.append("g").attr("transform", `translate(0, ${height})`).call(legendAxis);
}

function render() {
  svg.selectAll("*").remove();

  const years = state.years;
  const plotWidth = years.length * cellWidth;
  const plotHeight = months.length * cellHeight;
  const totalWidth = margin.left + plotWidth + margin.right;
  const totalHeight = margin.top + plotHeight + margin.bottom;

  svg.attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`);

  const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  const x = d3.scaleBand().domain(years).range([0, plotWidth]);
  const y = d3.scaleBand().domain(months).range([0, plotHeight]);

  const valueKey = viewMode;
  const lineLabel = viewMode === "max" ? "Maximum" : "Minimum";

  const validCells = state.monthly.filter((d) => d.hasData);
  const valueExtent = d3.extent(validCells, (d) => d[valueKey]);

  const color = d3
    .scaleSequential(viewMode === "max" ? d3.interpolateYlOrRd : d3.interpolateBlues)
    .domain([valueExtent[0], valueExtent[1]]);

  const xAxis = d3.axisTop(x).tickSize(0);
  g.append("g").attr("class", "axis").call(xAxis).call((sel) => sel.select(".domain").remove());

  const yAxis = d3.axisLeft(y).tickFormat((m) => monthName(m)).tickSize(0);
  g.append("g").attr("class", "axis").call(yAxis).call((sel) => sel.select(".domain").remove());

  const sparkX = d3.scaleLinear().domain([1, 31]).range([5, cellWidth - 5]);

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
          .html(`<strong>${d.year}-${String(d.month).padStart(2, "0")}</strong><br>No data available`);
        return;
      }

      const temp = d[valueKey];
      const startDate = fullDate(d.days[0].date);
      const endDate = fullDate(d.days[d.days.length - 1].date);

      tooltip
        .style("visibility", "visible")
        .html(
          `<strong>${d.year}-${String(d.month).padStart(2, "0")}</strong><br>${lineLabel} monthly mean: ${fmt1(temp)} deg C<br>Date range: ${startDate} to ${endDate}<br>Days recorded: ${d.days.length}`
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
    });

  cells
    .append("rect")
    .attr("width", cellWidth)
    .attr("height", cellHeight)
    .attr("fill", (d) => (d.hasData ? color(d[valueKey]) : "#ecefe6"));

  const lineGen = d3
    .line()
    .x((d) => sparkX(d.day))
    .y((d) => d.y)
    .curve(d3.curveMonotoneX);

  cells.each(function (d) {
    if (!d.hasData || d.days.length === 0) {
      return;
    }

    const group = d3.select(this);
    const tempValues = d.days.map((p) => p[valueKey]);

    let localMin = d3.min(tempValues);
    let localMax = d3.max(tempValues);

    if (localMin === localMax) {
      localMin -= 1;
      localMax += 1;
    }

    const sparkY = d3.scaleLinear().domain([localMin, localMax]).nice().range([cellHeight - 4, 4]);

    const points = d.days.map((p) => ({ day: p.day, y: sparkY(p[valueKey]) }));

    group.append("path").attr("class", "sparkline").attr("d", lineGen(points));
  });

  makeLegend(
    svg,
    color,
    margin.left + plotWidth + 36,
    margin.top + 120,
    130,
    12,
    `${lineLabel} temperature (deg C)`
  );

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", totalHeight - 14)
    .attr("fill", "#354250")
    .attr("font-size", 12)
    .text(`Years shown: ${years[0]} to ${years[years.length - 1]} | 1 cell = 1 month`);
}

function preprocess(rows) {
  const byMonth = d3.rollup(
    rows,
    (arr) => {
      arr.sort((a, b) => d3.ascending(a.date, b.date));
      return {
        year: arr[0].date.getFullYear(),
        month: arr[0].date.getMonth() + 1,
        max: d3.mean(arr, (d) => d.max),
        min: d3.mean(arr, (d) => d.min),
        days: arr.map((d) => ({
          day: d.date.getDate(),
          max: d.max,
          min: d.min,
          date: d.date,
        })),
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
        monthly.push({ year, month, max: null, min: null, days: [], hasData: false });
      }
    });
  });

  state = { monthly, years };
}

function initControls() {
  d3.select("#showMax").on("click", function () {
    viewMode = "max";
    d3.selectAll(".mode-btn").classed("active", false);
    d3.select(this).classed("active", true);
    render();
  });

  d3.select("#showMin").on("click", function () {
    viewMode = "min";
    d3.selectAll(".mode-btn").classed("active", false);
    d3.select(this).classed("active", true);
    render();
  });
}

async function run() {
  const raw = await d3.csv("temperature_daily.csv", parseRow);
  const lastTenYears = raw.filter((d) => {
    const y = d.date.getFullYear();
    return y >= 2008 && y <= 2017;
  });

  preprocess(lastTenYears);
  initControls();
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
