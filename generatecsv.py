import csv
import random

# Define some sample data for nodes and relationships
nodes = [f"Node{i}" for i in range(1, 501)]  # 500 unique nodes
relationships = ["connected_to", "related_to", "depends_on", "part_of"]

# Generate a CSV file with 1000 lines
with open("sample_graph.csv", mode="w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["Node1", "Node2", "Relationship"])  # Header row

    for _ in range(1000):
        node1 = random.choice(nodes)
        node2 = random.choice(nodes)
        while node2 == node1:  # Ensure that Node1 and Node2 are not the same
            node2 = random.choice(nodes)
        relationship = random.choice(relationships)
        writer.writerow([node1, node2, relationship])

print("sample_graph.csv has been generated with 1000 lines.")
