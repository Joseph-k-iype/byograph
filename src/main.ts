import './style.css'
import {
  GraphComponent,
  GraphViewerInputMode,
  ICommand,
  INode,
  Rect,
  GraphModelManager,
  ShapeNodeStyle,
  PolylineEdgeStyle,
  OrganicLayout,
  HierarchicLayout,
  CircularLayout,
  TreeLayout,
  LayoutExecutor,
  ShortestPath,
  IEdge,
  IGraph,
  Arrow,
  TransitiveClosure,
} from 'yfiles'

// yFiles license information
import './lib/yFilesLicense'

// Global variables
interface CSVFileData {
  fileName: string
  headers: string[]
  data: string[][]
}

const csvFilesData: CSVFileData[] = [] // Store multiple CSV files data
let selectedNodes: INode[] = [] // Store selected nodes for the shortest path
const nodeTypeCustomizations = new Map<string, { color: string, sizeFactor: number }>() // Customizations for each node type (header)
const headerColorMap = new Map<string, string>() // Map to store colors for each header type (e.g., 'sending', 'receiving')
const headerSizeMap = new Map<string, number>() // Map to store size factor for each header (1x, 1.5x, etc.)
const usedHeaders = new Set<string>() // Track headers used in relationships

let transitiveEdgesVisible = false // Track the visibility of transitive edges
let transitiveEdges: IEdge[] = [] // Store transitive edges to toggle them on and off

document.addEventListener('DOMContentLoaded', () => {
  run()
})

async function run() {
  const exploreGraphComponent = await initializeGraphComponent('#exploreGraphComponent')
  const schemaGraphComponent = await initializeGraphComponent('#schemaGraphComponent')

  resizeGraphComponent(exploreGraphComponent)
  resizeGraphComponent(schemaGraphComponent)

  initializeToolbar(exploreGraphComponent, schemaGraphComponent)
  setupCsvUpload(exploreGraphComponent, schemaGraphComponent)
  setupRelationshipDefinitionForm(exploreGraphComponent, schemaGraphComponent)
  setupNodeSelection(exploreGraphComponent)
  setupCustomizationApplication(exploreGraphComponent)

  window.addEventListener('resize', () => {
    resizeGraphComponent(exploreGraphComponent)
    resizeGraphComponent(schemaGraphComponent)
  })

  // Set up layout dropdown
  setupLayoutDropdown(exploreGraphComponent)
}

function resizeGraphComponent(graphComponent: GraphComponent) {
  const container = graphComponent.div
  if (container) {
    const { width, height } = container.getBoundingClientRect()
    if (width > 0 && height > 0) {
      graphComponent.div.style.width = `${width}px`
      graphComponent.div.style.height = `${height}px`
      graphComponent.fitGraphBounds() // Adjust graph to fit the new size
      graphComponent.updateContentRect() // Ensure content rect is updated
    }
  }
}

async function initializeGraphComponent(selector: string): Promise<GraphComponent> {
  const graphComponent = new GraphComponent(selector)
  graphComponent.graphModelManager = new GraphModelManager() // Use standard rendering
  graphComponent.inputMode = new GraphViewerInputMode()
  console.log(`Graph component initialized for ${selector}.`) // Debugging
  return graphComponent
}

// Initialize toolbar buttons and features
function initializeToolbar(exploreGraphComponent: GraphComponent, schemaGraphComponent: GraphComponent) {
  const increaseZoomBtn = document.getElementById('btn-increase-zoom')
  const decreaseZoomBtn = document.getElementById('btn-decrease-zoom')
  const fitGraphBtn = document.getElementById('btn-fit-graph')
  const toggleTransitiveBtn = document.getElementById('btn-toggle-transitive') // New button for transitive closure

  if (increaseZoomBtn && decreaseZoomBtn && fitGraphBtn) {
    increaseZoomBtn.addEventListener('click', () => {
      ICommand.INCREASE_ZOOM.execute(null, exploreGraphComponent)
    })
    decreaseZoomBtn.addEventListener('click', () => {
      ICommand.DECREASE_ZOOM.execute(null, exploreGraphComponent)
    })
    fitGraphBtn.addEventListener('click', () => {
      ICommand.FIT_GRAPH_BOUNDS.execute(null, exploreGraphComponent)
    })
  } else {
    console.error("Toolbar buttons are not found in the DOM")
  }

  // Toggle Transitive Edges button event
  if (toggleTransitiveBtn) {
    toggleTransitiveBtn.addEventListener('click', () => {
      const exploreGraph = exploreGraphComponent.graph; // Define exploreGraph
      toggleTransitiveEdges(exploreGraphComponent, exploreGraph)
    })
  }
}

// Function to calculate and add transitive edges to the graph
function addTransitiveEdges(graph: IGraph) {
  const transitiveClosure = new TransitiveClosure()

  // Run the transitive closure algorithm
  const closureResult = transitiveClosure.run(graph)

  // Retrieve the transitive closure edges to add
  const transitiveEdgesToAdd = closureResult.edgesToAdd

  transitiveEdgesToAdd.forEach(edge => {
    const source = edge.source
    const target = edge.target

    // Check if an edge already exists between source and target
    const existingEdge = graph.edges.find(e => e.sourceNode === source && e.targetNode === target)
    if (!existingEdge) {
      const transitiveEdge = graph.createEdge(source, target)
      graph.setStyle(transitiveEdge, new PolylineEdgeStyle({
        stroke: '2px dashed #FF6347', // Dotted line in a different color (e.g., orange-red)
        targetArrow: new Arrow({ type: 'triangle', fill: '#FF6347' })
      }))
      transitiveEdges.push(transitiveEdge) // Track transitive edges
    }
  })

  console.log(`${transitiveEdges.length} transitive edges added.`)
}

// Function to toggle the visibility of transitive edges
function toggleTransitiveEdges(graphComponent: GraphComponent, graph: IGraph) {
  transitiveEdgesVisible = !transitiveEdgesVisible

  transitiveEdges.forEach(edge => {
    graph.setStyle(edge, new PolylineEdgeStyle({
      stroke: '2px dashed #FF6347',
      targetArrow: new Arrow({ type: 'triangle', fill: '#FF6347' })
    }))
    edge.tag = { visible: transitiveEdgesVisible } // Store the visibility in tag
  })

  graph.edges.forEach(edge => {
    // Set visibility by using tag information
    const isVisible = edge.tag ? edge.tag.visible !== false : true
    if (!isVisible) {
      graph.remove(edge) // Optionally remove edge when not visible
    }
  })

  graphComponent.invalidate() // Refresh graph view

  console.log(transitiveEdgesVisible ? 'Showing transitive edges.' : 'Hiding transitive edges.')
}

// Handle CSV upload and parsing
function setupCsvUpload(exploreGraphComponent: GraphComponent, schemaGraphComponent: GraphComponent) {
  const csvInput = document.getElementById('csv-upload') as HTMLInputElement
  const submitButton = document.getElementById('submit-csv-btn') as HTMLButtonElement
  const addRelationshipBlockBtn = document.getElementById('add-relationship-block-btn') as HTMLButtonElement

  submitButton.addEventListener('click', async () => {
    console.log('Submit button clicked') // Debugging statement
    if (csvInput.files?.length) {
      console.log(`${csvInput.files.length} files selected for upload`) // Debugging statement

      csvFilesData.length = 0
      nodeTypeCustomizations.clear()
      usedHeaders.clear()
      document.getElementById('customization-options')!.innerHTML = ''

      for (const file of csvInput.files) {
        const text = await file.text()
        const data = text
          .trim()
          .split('\n')
          .map((line) => line.split(','))
        const headers = data[0]
        console.log(`Processing file: ${file.name}, with headers: ${headers}`) // Debugging statement

        csvFilesData.push({
          fileName: file.name,
          headers: headers,
          data: data.slice(1),
        })
      }

      console.log('CSV Data:', csvFilesData) // Debugging to check the structure
      assignColorsToHeaders()

      // Enable the "Add Relationship" button after CSV is uploaded
      if (csvFilesData.length > 0) {
        console.log("CSV files processed successfully. Enabling 'Add Relationship' button.") // Debugging statement
        addRelationshipBlockBtn.disabled = false
      }
    } else {
      console.log('No CSV files uploaded.') // Debugging statement
      alert('Please upload at least one CSV file before submitting.')
    }
  })
}

// Assign colors based on headers (e.g., 'sending', 'receiving')
function assignColorsToHeaders() {
  csvFilesData.forEach((csvFile) => {
    csvFile.headers.forEach((header) => {
      if (!headerColorMap.has(header)) {
        headerColorMap.set(header, getRandomColor())
      }
    })
  })
  console.log('Header colors assigned: ', headerColorMap) // Debugging statement
}

// Set up relationship definitions
function setupRelationshipDefinitionForm(exploreGraphComponent: GraphComponent, schemaGraphComponent: GraphComponent) {
  const addRelationshipBlockBtn = document.getElementById('add-relationship-block-btn') as HTMLButtonElement
  const dynamicRelationshipsContainer = document.getElementById('dynamic-relationships-container') as HTMLDivElement
  const generateGraphBtn = document.getElementById('add-relationship-btn') as HTMLButtonElement

  addRelationshipBlockBtn.disabled = true // Initially disable the button

  addRelationshipBlockBtn.addEventListener('click', () => {
    if (csvFilesData.length === 0) {
      console.log('No CSV data available to add relationships.') // Debugging statement
      alert('Please upload CSV files before adding relationships.')
      return
    }
    console.log('Adding relationship block.') // Debugging statement
    addRelationshipBlock()
    if (dynamicRelationshipsContainer.children.length > 0) {
      generateGraphBtn.disabled = false // Enable the Generate Graph button when a relationship is added
    }
  })

  function addRelationshipBlock() {
    const relationshipBlock = document.createElement('div')
    relationshipBlock.classList.add('relationship-block', 'mb-3')

    const relationshipHeader = document.createElement('h6')
    relationshipHeader.textContent = `Relationship`
    relationshipHeader.classList.add('mb-2')
    relationshipBlock.appendChild(relationshipHeader)

    const sourceCsvLabel = document.createElement('label')
    sourceCsvLabel.textContent = `Source CSV`
    const sourceCsvSelect = document.createElement('select')
    sourceCsvSelect.classList.add('form-select', 'source-csv-select', 'mb-2')

    csvFilesData.forEach((csvFile) => {
      const option = document.createElement('option')
      option.value = csvFile.fileName
      option.text = csvFile.fileName
      sourceCsvSelect.appendChild(option)
    })

    const sourceSelect = document.createElement('select')
    sourceSelect.classList.add('form-select', 'source-select', 'mb-2')

    const targetCsvLabel = document.createElement('label')
    targetCsvLabel.textContent = `Target CSV`
    const targetCsvSelect = document.createElement('select')
    targetCsvSelect.classList.add('form-select', 'target-csv-select', 'mb-2')

    csvFilesData.forEach((csvFile) => {
      const option = document.createElement('option')
      option.value = csvFile.fileName
      option.text = csvFile.fileName
      targetCsvSelect.appendChild(option)
    })

    const targetSelect = document.createElement('select')
    targetSelect.classList.add('form-select', 'target-select', 'mb-2')

    const edgeLabelInput = document.createElement('input')
    edgeLabelInput.classList.add('form-control', 'edge-label-input', 'mb-2')
    edgeLabelInput.placeholder = `Edge Label`

    sourceCsvSelect.addEventListener('change', () => {
      populateColumns(sourceCsvSelect, sourceSelect)
    })

    targetCsvSelect.addEventListener('change', () => {
      populateColumns(targetCsvSelect, targetSelect)
    })

    populateColumns(sourceCsvSelect, sourceSelect)
    populateColumns(targetCsvSelect, targetSelect)

    relationshipBlock.appendChild(sourceCsvLabel)
    relationshipBlock.appendChild(sourceCsvSelect)
    relationshipBlock.appendChild(sourceSelect)
    relationshipBlock.appendChild(targetCsvLabel)
    relationshipBlock.appendChild(targetCsvSelect)
    relationshipBlock.appendChild(targetSelect)
    relationshipBlock.appendChild(edgeLabelInput)

    dynamicRelationshipsContainer.appendChild(relationshipBlock)

    generateGraphBtn.disabled = false
  }

  generateGraphBtn.addEventListener('click', () => {
    if (csvFilesData.length === 0) {
      console.log('No CSV data available for generating graph.') // Debugging statement
      alert('Please upload CSV files and define relationships before generating the graph.')
      return
    }
    console.log('Generating graph for both explore and schema views.') // Debugging statement
    generateGraph(exploreGraphComponent, schemaGraphComponent)
  })
}

function populateColumns(csvSelect: HTMLSelectElement, columnSelect: HTMLSelectElement) {
  const selectedCsvFile = csvFilesData.find((csv) => csv.fileName === csvSelect.value)
  if (selectedCsvFile) {
    columnSelect.innerHTML = '' // Clear previous columns
    selectedCsvFile.headers.forEach((header) => {
      const option = document.createElement('option')
      option.value = header
      option.text = header
      columnSelect.appendChild(option)
    })
    console.log(`Populated columns for ${csvSelect.value}`) // Debugging statement
  }
}

function generateGraph(exploreGraphComponent: GraphComponent, schemaGraphComponent: GraphComponent) {
  const exploreGraph = exploreGraphComponent.graph;
  const schemaGraph = schemaGraphComponent.graph;

  exploreGraph.clear();
  schemaGraph.clear();

  const relationshipBlocks = document.querySelectorAll('.relationship-block');

  relationshipBlocks.forEach((block) => {
    const sourceCsvSelect = block.querySelector('.source-csv-select') as HTMLSelectElement;
    const targetCsvSelect = block.querySelector('.target-csv-select') as HTMLSelectElement;
    const sourceSelect = block.querySelector('.source-select') as HTMLSelectElement;
    const targetSelect = block.querySelector('.target-select') as HTMLSelectElement;
    const edgeLabelInput = block.querySelector('.edge-label-input') as HTMLInputElement;

    const sourceHeader = sourceSelect.value;
    const targetHeader = targetSelect.value;
    const edgeLabel = edgeLabelInput.value;

    const sourceCsvFile = csvFilesData.find((csv) => csv.fileName === sourceCsvSelect.value);
    const targetCsvFile = csvFilesData.find((csv) => csv.fileName === targetCsvSelect.value);

    if (!sourceCsvFile || !targetCsvFile) {
      return;
    }

    // Explore View Graph: Data nodes and relationships
    sourceCsvFile.data.forEach((row, rowIndex) => {
      const sourceValue = row[sourceCsvFile.headers.indexOf(sourceHeader)];
      const targetValue = targetCsvFile.data[rowIndex]?.[targetCsvFile.headers.indexOf(targetHeader)];

      if (!sourceValue || !targetValue) {
        return;
      }

      // Fetch styles for both source and target
      const sourceColor = headerColorMap.get(sourceHeader) || getRandomColor();
      const targetColor = headerColorMap.get(targetHeader) || getRandomColor();
      const sourceSize = headerSizeMap.get(sourceHeader) || 1;
      const targetSize = headerSizeMap.get(targetHeader) || 1;

      // Track the used headers
      usedHeaders.add(sourceHeader);
      usedHeaders.add(targetHeader);

      // Create source node if it doesn't exist
      let sourceNode = exploreGraph.nodes.find((node) => node.tag === sourceValue);
      if (!sourceNode) {
        sourceNode = exploreGraph.createNode({
          layout: new Rect(0, 0, 50 * sourceSize, 50 * sourceSize), // Size factor based on header
          style: createNodeStyle(sourceColor), // Use color only
          tag: sourceValue,
        });
        exploreGraph.addLabel(sourceNode, sourceValue);
      }

      // Create target node if it doesn't exist
      let targetNode = exploreGraph.nodes.find((node) => node.tag === targetValue);
      if (!targetNode) {
        targetNode = exploreGraph.createNode({
          layout: new Rect(0, 0, 50 * targetSize, 50 * targetSize), // Size factor based on header
          style: createNodeStyle(targetColor), // Use color only
          tag: targetValue,
        });
        exploreGraph.addLabel(targetNode, targetValue);
      }

      // Create edge between source and target nodes
      const edge = exploreGraph.createEdge(sourceNode, targetNode);
      if (edgeLabel) {
        exploreGraph.addLabel(edge, edgeLabel);
      }
    });

    // Schema View Graph: Only headers as nodes and relationships between them
    let sourceHeaderNode = schemaGraph.nodes.find((node) => node.tag === sourceHeader);
    if (!sourceHeaderNode) {
      sourceHeaderNode = schemaGraph.createNode({
        layout: new Rect(0, 0, 100, 100),
        style: createNodeStyle(headerColorMap.get(sourceHeader) || '#00F'), // Use color only
        tag: sourceHeader,
      });
      schemaGraph.addLabel(sourceHeaderNode, sourceHeader);
    }

    let targetHeaderNode = schemaGraph.nodes.find((node) => node.tag === targetHeader);
    if (!targetHeaderNode) {
      targetHeaderNode = schemaGraph.createNode({
        layout: new Rect(0, 0, 100, 100),
        style: createNodeStyle(headerColorMap.get(targetHeader) || '#F00'), // Use color only
        tag: targetHeader,
      });
      schemaGraph.addLabel(targetHeaderNode, targetHeader);
    }

    // Create edge between the header nodes (relationship definition)
    const schemaEdge = schemaGraph.createEdge(sourceHeaderNode, targetHeaderNode);
    if (edgeLabel) {
      schemaGraph.addLabel(schemaEdge, edgeLabel);
    }
  });

  // Apply layout for both graphs
  applyLayout(exploreGraphComponent, 'organic');
  applyLayout(schemaGraphComponent, 'organic');

  // Log details for debugging
  console.log(`Total number of nodes (Explore): ${exploreGraph.nodes.size}`);
  console.log(`Total number of edges (Explore): ${exploreGraph.edges.size}`);
  console.log(`Total number of nodes (Schema): ${schemaGraph.nodes.size}`);
  console.log(`Total number of edges (Schema): ${schemaGraph.edges.size}`);

  // Populate customization options for the headers used in the graph
  populateCustomizationOptions(exploreGraph);

  // Force refresh of the graph with the new styles
  exploreGraphComponent.invalidate();
}

function setupCustomizationApplication(graphComponent: GraphComponent) {
  const applyCustomizationBtn = document.getElementById('apply-customization-btn') as HTMLButtonElement;

  applyCustomizationBtn.addEventListener('click', () => {
    console.log("Applying node customizations based on dynamically fetched headers.");
    const graph = graphComponent.graph;

    // Apply customizations only to nodes with a matching node type (Source or Target)
    graph.nodes.forEach((node) => {
      const nodeHeader = getNodeHeaderFromTag(node.tag); // Get the node's type (e.g., Source_Asset_ID or Target_Asset_ID)

      // Check if the node type has any customization defined
      if (nodeHeader && nodeTypeCustomizations.has(nodeHeader)) {
        const { color, sizeFactor } = nodeTypeCustomizations.get(nodeHeader)!; // Fetch the customization for the node type

        // Apply color and size factor only if customization exists for this node type
        const newSize = sizeFactor ? 50 * sizeFactor : node.layout.width; // Apply size factor
        const newColor = color || headerColorMap.get(nodeHeader) || getRandomColor(); // Apply color or default if none

        // Apply the customization to the current node
        graph.setStyle(node, createNodeStyle(newColor)); // Set the node color
        graph.setNodeLayout(node, new Rect(node.layout.x, node.layout.y, newSize, newSize)); // Set the node size

        console.log(`Applied customization to ${node.tag}: color = ${newColor}, size = ${newSize}`);
      } else {
        console.log(`No customization found for ${node.tag} (${nodeHeader})`);
      }
    });

    // Redraw the graph with updated styles
    graphComponent.invalidate();
  });
}


// Populate node customization options based on used headers
function populateCustomizationOptions(graph: IGraph) {
  const customizationContainer = document.getElementById('customization-options')!;
  customizationContainer.innerHTML = ''; // Clear previous customizations

  // Loop through the used headers in the relationships
  usedHeaders.forEach(header => {
    const optionDiv = document.createElement('div');
    optionDiv.classList.add('mb-2');

    // Create a label and color input for the header
    const label = document.createElement('label');
    label.textContent = `Customize ${header} color:`;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = headerColorMap.get(header) || getRandomColor(); // Get existing color or generate a new one
    input.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;

      // Ensure both color and sizeFactor are always set
      const currentCustomization = nodeTypeCustomizations.get(header) || { color: '#000000', sizeFactor: 1 };
      nodeTypeCustomizations.set(header, { ...currentCustomization, color }); // Set color for the entire header
      headerColorMap.set(header, color); // Store the color in the header map
      console.log(`Color set for ${header}: ${color}`); // Debugging
    });

    optionDiv.appendChild(label);
    optionDiv.appendChild(input);

    // Add size selector for the node type (header)
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = `Resize ${header} nodes:`;
    const sizeSelect = document.createElement('select');
    sizeSelect.classList.add('form-select', 'mb-2');
    const sizes = [1, 1.5, 2, 2.5]; // Different size factors
    sizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size.toString();
      option.text = `${size}x`;
      sizeSelect.appendChild(option);
    });

    sizeSelect.addEventListener('change', (e) => {
      const sizeFactor = parseFloat((e.target as HTMLSelectElement).value);

      // Ensure both color and sizeFactor are always set
      const currentCustomization = nodeTypeCustomizations.get(header) || { color: '#000000', sizeFactor: 1 };
      nodeTypeCustomizations.set(header, { ...currentCustomization, sizeFactor }); // Set size factor for the entire header
      headerSizeMap.set(header, sizeFactor); // Store the size factor in the header map
      console.log(`Size set for ${header}: ${sizeFactor}`); // Debugging
    });

    optionDiv.appendChild(sizeLabel);
    optionDiv.appendChild(sizeSelect);

    customizationContainer.appendChild(optionDiv);
  });

  console.log("Customization options populated based on used headers.");
}


// Helper function to get the corresponding header from the node tag
function getNodeHeaderFromTag(tag: any): string | null {
  const relationshipBlocks = document.querySelectorAll('.relationship-block');
  
  for (const block of relationshipBlocks) {
    const sourceSelect = block.querySelector('.source-select') as HTMLSelectElement;
    const targetSelect = block.querySelector('.target-select') as HTMLSelectElement;

    const sourceHeader = sourceSelect.value;
    const targetHeader = targetSelect.value;

    // Loop through the CSV data to match the tag
    for (const csvFile of csvFilesData) {
      const sourceIndex = csvFile.headers.indexOf(sourceHeader);
      const targetIndex = csvFile.headers.indexOf(targetHeader);

      // Check if the tag matches either source or target column value
      const sourceMatch = csvFile.data.some(row => row[sourceIndex] === tag);
      const targetMatch = csvFile.data.some(row => row[targetIndex] === tag);

      if (sourceMatch) {
        return sourceHeader; // Return the source header dynamically
      } else if (targetMatch) {
        return targetHeader; // Return the target header dynamically
      }
    }
  }
  return null; // No matching header found
}


function applyLayout(graphComponent: GraphComponent, layoutType: string) {
  let layout
  switch (layoutType) {
    case 'organic':
      layout = new OrganicLayout()
      layout.preferredEdgeLength = 100 // Ensure nodes don't overlap
      break
    case 'hierarchic':
      layout = new HierarchicLayout()
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
  const layoutExecutor = new LayoutExecutor({
    graphComponent,
    layout,
    duration: '1s',
    animateViewport: true,
  })
  layoutExecutor.start()
}

function setupNodeSelection(graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const inputMode = graphComponent.inputMode as GraphViewerInputMode

  inputMode.addItemClickedListener((sender, evt) => {
    const node = evt.item as INode
    if (!INode.isInstance(node)) {
      return
    }
    if (selectedNodes.includes(node)) {
      selectedNodes = selectedNodes.filter((n) => n !== node)
    } else {
      selectedNodes.push(node)
    }

    if (selectedNodes.length === 2) {
      highlightShortestPath(graphComponent, graph, selectedNodes)
      selectedNodes = []
    }
  })
}

function highlightShortestPath(graphComponent: GraphComponent, graph: IGraph, nodes: INode[]) {
  // Ensure two nodes are selected
  if (nodes.length !== 2) {
    console.error('You must select exactly two nodes for the shortest path calculation.')
    return
  }

  const sourceNode = nodes[0]
  const targetNode = nodes[1]

  // Check if both source and target nodes are valid
  if (!INode.isInstance(sourceNode) || !INode.isInstance(targetNode)) {
    console.error('Both source and target nodes must be valid instances of INode.')
    return
  }

  // Reset styles for all edges and nodes before highlighting the path
  graph.edges.forEach(edge => {
    const newStyle = new PolylineEdgeStyle({
      stroke: '2px black',
      targetArrow: new Arrow({ type: 'triangle' }),
    })
    graph.setStyle(edge, newStyle)
  })

  graph.nodes.forEach(node => {
    const nodeType = node.tag as string
    const color = headerColorMap.get(nodeType) || getRandomColor() // Set color based on node type
    const newStyle = createNodeStyle(color)
    graph.setStyle(node, newStyle)
  })

  // Run the shortest path algorithm
  try {
    const shortestPaths = new ShortestPath({
      source: sourceNode,
      sink: targetNode, // Specify the target node
      directed: false,
      costs: (edge: IEdge) => 1, // Uniform cost for all edges
    })

    const result = shortestPaths.run(graph)
    const path = result.path || null

    if (path) {
      // Highlight the path edges and nodes
      path.edges.forEach(edge => {
        graph.setStyle(edge, new PolylineEdgeStyle({
          stroke: '2px red',
          targetArrow: new Arrow({ type: 'triangle' }),
        }))
      })

      path.nodes.forEach(node => {
        graph.setStyle(node, new ShapeNodeStyle({
          fill: 'red',
          shape: 'ellipse',
        }))
      })

      graphComponent.invalidate() // Redraw the graph with highlighted path
    } else {
      console.log('No path found between the selected nodes.')
      alert('No path found between the selected nodes.')
    }
  } catch (error) {
    console.error('Error during shortest path calculation:', (error as Error).message)
    alert('Error calculating shortest path: ' + (error as Error).message)
  }
}

// Set up layout dropdown to change layouts
function setupLayoutDropdown(graphComponent: GraphComponent) {
  const layoutDropdown = document.getElementById('layout-dropdown') as HTMLSelectElement
  layoutDropdown.addEventListener('change', (event) => {
    const selectedLayout = (event.target as HTMLSelectElement).value
    applyLayout(graphComponent, selectedLayout)
  })
}

// Function to create a node style (only based on color)
function createNodeStyle(color: string): ShapeNodeStyle {
  return new ShapeNodeStyle({
    fill: color,
    shape: 'ellipse', // Ensure nodes are circular
    stroke: `2px solid ${color}`,
  });
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
