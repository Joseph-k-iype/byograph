import './assets/icons/icons.css'
import './style.css'
import './dialog.css'
import {
  GraphComponent,
  GraphViewerInputMode,
  ICommand,
  ScrollBarVisibility,
  INode,
  ShapeNodeStyle,
  PolylineEdgeStyle,
  Rect,
  LayoutExecutor,
  ExteriorLabelModel,
  ExteriorLabelModelPosition,
  OrganicLayout,
  HierarchicLayout,
  OrthogonalLayout,
  CircularLayout,
  TreeLayout,
  ShortestPath,
  IGraph,
  IEdge,
  Arrow
} from 'yfiles'
import { enableFolding } from './lib/FoldingSupport'
import loadGraph from './lib/loadGraph'
import './lib/yFilesLicense'
import { initializeTooltips } from './tooltips'
import { exportDiagram } from './diagram-export'
import { initializeContextMenu } from './context-menu'
import { initializeGraphSearch } from './graph-search'

// Global variables
let csvHeaders: string[] = [] // Store CSV headers
let csvData: string[][] = [] // Store CSV rows
let selectedNodes: INode[] = [] // Store selected nodes for the shortest path
const nodeTypeColorPickers = new Map<string, HTMLInputElement>() // Color pickers for each node type
const definedNodeTypes = new Set<string>() // Store node types actually used in relationships

// Assign colors to headers (node types) only for defined relationships
function assignColorsToHeaders(headers: string[]) {
  headers.forEach(header => {
    if (definedNodeTypes.has(header) && !nodeTypeColorPickers.has(header)) {
      const colorPicker = createColorPicker(header)
      nodeTypeColorPickers.set(header, colorPicker) // Add color picker for each node type
    }
  })
}

// Create a color picker for each node type
function createColorPicker(nodeType: string): HTMLInputElement {
  const container = document.getElementById('color-picker-container') as HTMLElement
  const label = document.createElement('label')
  label.textContent = `Color for ${nodeType}:`
  label.classList.add('form-label')
  
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.classList.add('form-control', 'color-picker')
  colorInput.value = getRandomColor() // Assign a random initial color

  container.appendChild(label)
  container.appendChild(colorInput)
  
  return colorInput
}

// Initialize the graph component and related features
async function run() {
  const graphComponent = await initializeGraphComponent()
  initializeToolbar(graphComponent)
  initializeTooltips(graphComponent)
  initializeContextMenu(graphComponent)
  initializeGraphSearch(graphComponent)

  // Set up CSV upload and form logic
  setupCsvUpload(graphComponent)
  setupRelationshipDefinitionForm(graphComponent)
  setupNodeSelection(graphComponent)
  initializeCustomizeFeatures(graphComponent)
}

// Initialize the graph component
async function initializeGraphComponent(): Promise<GraphComponent> {
  const graphComponent = new GraphComponent(
    document.querySelector('.graph-component-container')!
  )
  graphComponent.horizontalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC
  graphComponent.verticalScrollBarPolicy = ScrollBarVisibility.AS_NEEDED_DYNAMIC

  const mode = new GraphViewerInputMode()
  mode.navigationInputMode.allowCollapseGroup = true
  mode.navigationInputMode.allowEnterGroup = true
  mode.navigationInputMode.allowExitGroup = true
  mode.navigationInputMode.allowExpandGroup = true
  graphComponent.inputMode = mode

  graphComponent.graph = enableFolding(await loadGraph())
  graphComponent.fitGraphBounds()

  return graphComponent
}

// Initialize the toolbar and export buttons
function initializeToolbar(graphComponent: GraphComponent) {
  document.getElementById('btn-increase-zoom')!.addEventListener('click', () => {
    ICommand.INCREASE_ZOOM.execute(null, graphComponent)
  })
  document.getElementById('btn-decrease-zoom')!.addEventListener('click', () => {
    ICommand.DECREASE_ZOOM.execute(null, graphComponent)
  })
  document.getElementById('btn-fit-graph')!.addEventListener('click', () => {
    ICommand.FIT_GRAPH_BOUNDS.execute(null, graphComponent)
  })
  document.getElementById('btn-export-svg')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'svg')
  })
  document.getElementById('btn-export-png')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'png')
  })
  document.getElementById('btn-export-pdf')!.addEventListener('click', () => {
    exportDiagram(graphComponent, 'pdf')
  })
}

// Handle CSV upload and parsing
function setupCsvUpload(graphComponent: GraphComponent) {
  const csvInput = document.getElementById('csv-upload') as HTMLInputElement
  const submitButton = document.getElementById('submit-csv-btn') as HTMLButtonElement

  submitButton.addEventListener('click', async () => {
    if (csvInput.files?.length) {
      const file = csvInput.files[0]
      const text = await file.text()

      csvData = text.split('\n').map(line => line.split(','))
      csvHeaders = csvData[0]

      // Clear color pickers before assigning new ones
      document.getElementById('color-picker-container')!.innerHTML = ''

      assignColorsToHeaders(csvHeaders) // Assign colors to node types based on headers
    } else {
      alert("Please upload a CSV file before submitting.")
    }
  })
}

// Set up the form for relationship definitions
function setupRelationshipDefinitionForm(graphComponent: GraphComponent) {
  const defineRelationshipsBtn = document.getElementById('define-relationships-btn') as HTMLButtonElement
  const dynamicRelationshipsContainer = document.getElementById('dynamic-relationships-container') as HTMLDivElement

  defineRelationshipsBtn.addEventListener('click', () => {
    const relationshipCount = (document.getElementById('relationship-count') as HTMLInputElement).value
    dynamicRelationshipsContainer.innerHTML = '' // Clear previous fields
    definedNodeTypes.clear() // Clear previous relationships

    for (let i = 0; i < parseInt(relationshipCount); i++) {
      const relationshipBlock = document.createElement('div')
      relationshipBlock.classList.add('relationship-block')

      const sourceLabel = document.createElement('label')
      sourceLabel.textContent = `Source Column for Relationship ${i + 1}`
      const sourceSelect = document.createElement('select')
      sourceSelect.classList.add('form-select', 'source-select', 'mb-2')

      csvHeaders.forEach(header => {
        const option = document.createElement('option')
        option.value = header
        option.text = header
        sourceSelect.appendChild(option)
      })

      const targetLabel = document.createElement('label')
      targetLabel.textContent = `Target Column for Relationship ${i + 1}`
      const targetSelect = document.createElement('select')
      targetSelect.classList.add('form-select', 'target-select', 'mb-2')

      csvHeaders.forEach(header => {
        const option = document.createElement('option')
        option.value = header
        option.text = header
        targetSelect.appendChild(option)
      })

      const edgeLabelInput = document.createElement('input')
      edgeLabelInput.classList.add('form-control', 'edge-label-input', 'mb-2')
      edgeLabelInput.placeholder = `Edge Label for Relationship ${i + 1}`

      relationshipBlock.appendChild(sourceLabel)
      relationshipBlock.appendChild(sourceSelect)
      relationshipBlock.appendChild(targetLabel)
      relationshipBlock.appendChild(targetSelect)
      relationshipBlock.appendChild(edgeLabelInput)

      dynamicRelationshipsContainer.appendChild(relationshipBlock)

      // Add node types (source and target) to definedNodeTypes set
      definedNodeTypes.add(sourceSelect.value)
      definedNodeTypes.add(targetSelect.value)
    }

    // Reassign color pickers based on defined node types
    assignColorsToHeaders(Array.from(definedNodeTypes))
  })

  const addRelationshipBtn = document.getElementById('add-relationship-btn') as HTMLButtonElement
  addRelationshipBtn.addEventListener('click', async () => {
    const graph = graphComponent.graph
    graph.clear()

    const relationshipBlocks = document.querySelectorAll('.relationship-block')
    relationshipBlocks.forEach((block, index) => {
      const sourceSelect = block.querySelector('.source-select') as HTMLSelectElement
      const targetSelect = block.querySelector('.target-select') as HTMLSelectElement
      const edgeLabelInput = block.querySelector('.edge-label-input') as HTMLInputElement

      const sourceHeader = sourceSelect.value
      const targetHeader = targetSelect.value
      const edgeLabel = edgeLabelInput.value

      // Safely get colors from the color pickers or use default colors
      const sourceColor = nodeTypeColorPickers.get(sourceHeader)?.value || getRandomColor()
      const targetColor = nodeTypeColorPickers.get(targetHeader)?.value || getRandomColor()

      for (let i = 1; i < csvData.length; i++) {
        const row = csvData[i]
        if (row.length < csvHeaders.length) continue

        const sourceValue = row[csvHeaders.indexOf(sourceHeader)]
        const targetValue = row[csvHeaders.indexOf(targetHeader)]

        if (!sourceValue || !targetValue) continue

        let sourceNode = graph.nodes.find(node => node.tag === sourceValue)
        if (!sourceNode) {
          sourceNode = graph.createNode({
            layout: new Rect(0, 0, 50, 50),
            style: new ShapeNodeStyle({
              shape: 'ellipse',
              fill: sourceColor,
              stroke: `2px solid ${sourceColor}`,
            }),
            tag: sourceValue,
          })
          const labelModel = new ExteriorLabelModel({ insets: 5 })
          graph.addLabel(sourceNode, sourceValue, labelModel.createParameter(ExteriorLabelModelPosition.NORTH))
        }

        let targetNode = graph.nodes.find(node => node.tag === targetValue)
        if (!targetNode) {
          targetNode = graph.createNode({
            layout: new Rect(0, 0, 50, 50),
            style: new ShapeNodeStyle({
              shape: 'ellipse',
              fill: targetColor,
              stroke: `2px solid ${targetColor}`,
            }),
            tag: targetValue,
          })
          const labelModel = new ExteriorLabelModel({ insets: 5 })
          graph.addLabel(targetNode, targetValue, labelModel.createParameter(ExteriorLabelModelPosition.SOUTH))
        }

        const edge = graph.createEdge({
          source: sourceNode,
          target: targetNode,
          style: new PolylineEdgeStyle({
            stroke: `2px solid ${sourceColor}`,
            targetArrow: new Arrow({ type: 'triangle' })
          }),
          tag: edgeLabel,
        })
        graph.addLabel(edge, edgeLabel)
      }
    })

    applyLayout(graphComponent, 'organic') // Apply organic layout initially
  })
}

// Random color generator
function getRandomColor(): string {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

// Customize features like color pickers and layout application
function initializeCustomizeFeatures(graphComponent: GraphComponent) {
  document.getElementById('submit-color-btn')!.addEventListener('click', () => {
    const graph = graphComponent.graph

    graph.nodes.forEach(node => {
      const nodeType = node.tag as string
      const colorPicker = nodeTypeColorPickers.get(nodeType)
      if (colorPicker) {
        const color = colorPicker.value
        const newStyle = new ShapeNodeStyle({
          shape: 'ellipse',
          fill: color,
          stroke: `2px solid ${color}`,
        })
        graph.setStyle(node, newStyle)
      }
    })

    graphComponent.invalidate() // Redraw graph with updated styles
  })

  document.getElementById('apply-layout-btn')!.addEventListener('click', () => {
    const layoutType = (document.getElementById('layout-selector') as HTMLSelectElement).value
    applyLayout(graphComponent, layoutType)
  })
}

// Apply different layouts based on selection
function applyLayout(graphComponent: GraphComponent, layoutType: string) {
  let layout
  switch (layoutType) {
    case 'organic':
      layout = new OrganicLayout()
      break
    case 'hierarchic':
      layout = new HierarchicLayout()
      break
    case 'orthogonal':
      layout = new OrthogonalLayout()
      break
    case 'circular':
      layout = new CircularLayout()
      break
    case 'tree':
      layout = new TreeLayout()
      break
    default:
      layout = new OrganicLayout()
  }
  const layoutExecutor = new LayoutExecutor(graphComponent, layout)
  layoutExecutor.duration = '0.5s'
  layoutExecutor.start().then(() => graphComponent.fitGraphBounds())
}

// Initialize node selection for shortest path
function setupNodeSelection(graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const inputMode = graphComponent.inputMode as GraphViewerInputMode

  inputMode.addItemClickedListener((sender, evt) => {
    const node = evt.item as INode
    if (selectedNodes.includes(node)) {
      selectedNodes = selectedNodes.filter(n => n !== node) // Deselect node
    } else {
      selectedNodes.push(node) // Select node
    }

    console.log('Selected nodes:', selectedNodes.map(n => n.tag))

    if (selectedNodes.length === 2) {
      highlightShortestPath(graphComponent, graph, selectedNodes)
      selectedNodes = [] // Clear selection
    }
  })
}

// Highlight the shortest path between selected nodes
function highlightShortestPath(graphComponent: GraphComponent, graph: IGraph, nodes: INode[]) {
  if (nodes.length !== 2) {
    console.error('Exactly two nodes are required for shortest path.')
    return
  }

  const sourceNode = nodes[0]
  const targetNode = nodes[1]

  if (!sourceNode || !targetNode) {
    console.error('Invalid source or target node.')
    return
  }

  console.log('Running shortest path between:', sourceNode.tag, 'and', targetNode.tag)

  const shortestPath = new ShortestPath({ source: sourceNode, sink: targetNode, directed: false })
  
  try {
    const result = shortestPath.run(graph)

    if (!result || !result.edges || result.edges.size === 0) {
      console.error('No valid shortest path found.')
      return
    }

    const selectedEdges = new Set<IEdge>()
    result.edges.forEach(edge => selectedEdges.add(edge))

    selectedEdges.forEach(edge => {
      const polylineEdgeStyle = edge.style as PolylineEdgeStyle
      polylineEdgeStyle.stroke = '4px solid #00FF00' // Highlight path in green
    })

    nodes.forEach((node, index) => {
      const nodeStyle = node.style as ShapeNodeStyle
      nodeStyle.fill = index === 0 ? '#FF0000' : '#0000FF' // Start in red, end in blue
    })

    graphComponent.invalidate() // Redraw graph
  } catch (error) {
    console.error('Error calculating shortest path:', error)
  }
}

run()
