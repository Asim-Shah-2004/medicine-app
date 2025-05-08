from flask import Blueprint, request, jsonify
import os
import re
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.memory import ConversationBufferMemory
from langchain.tools import Tool
from langchain.agents import AgentType, initialize_agent
from langchain.utilities import GoogleSearchAPIWrapper
from app.utils.token_utils import token_required
from dotenv import load_dotenv

# Set up API key (in a production app, this would be environment variables)
load_dotenv()

os.environ.setdefault("GOOGLE_GENERATIVE_AI_API_KEY", os.getenv("GOOGLE_GENERATIVE_AI_API_KEY"))
os.environ.setdefault("GOOGLE_API_KEY", os.getenv("GOOGLE_API_KEY"))  # For search
os.environ.setdefault("GOOGLE_CSE_ID", os.getenv("GOOGLE_CSE_ID"))   # For search

chat_bp = Blueprint('chat', __name__)

# Simple medical term database (lightweight alternative to pretrained models)
MEDICAL_TERMS = {
    "HTN": "Hypertension",
    "DM": "Diabetes Mellitus",
    "MI": "Myocardial Infarction",
    "CVA": "Stroke",
    "COPD": "Chronic Obstructive Pulmonary Disease"
}

# Initialize Gemini model through Langchain
def init_gemini():
    try:
        gemini = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0.2,
            convert_system_message_to_human=True,
            system_message="You are an AI medical assistant. Provide medically accurate information and include citations to reliable sources when possible."
        )
        return gemini
    except Exception as e:
        print(f"Error initializing Gemini: {str(e)}")
        return None

# Initialize Google Search tool for medical research
def init_search_tool():
    try:
        search = GoogleSearchAPIWrapper(k=3)
        
        # Customize the search to focus on medical sources
        def medical_search(query):
            # Add medical qualifiers to the search
            medical_query = f"{query} medical information site:.gov OR site:.edu OR site:.org"
            results = search.run(medical_query)
            return results
        
        search_tool = Tool(
            name="Medical Search",
            description="Search for medical information from reliable sources",
            func=medical_search
        )
        
        return search_tool
    except Exception as e:
        print(f"Error initializing search tool: {str(e)}")
        return None

# Extract medical terms using simple regex patterns (very lightweight approach)
def extract_medical_terms(text):
    # Look for medical abbreviations from our database
    found_terms = []
    for term in MEDICAL_TERMS.keys():
        if re.search(r'\b' + re.escape(term) + r'\b', text, re.IGNORECASE):
            found_terms.append(f"{term} ({MEDICAL_TERMS[term]})")
    
    # Look for common symptom patterns
    symptom_patterns = [
        r'\b(pain|ache)\b', r'\b(fever|temperature)\b', 
        r'\bcough\b', r'\bdizz(y|iness)\b'
    ]
    
    for pattern in symptom_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            match = re.search(pattern, text, re.IGNORECASE).group(0)
            found_terms.append(match)
            
    return list(set(found_terms))

# Create citation extraction function
def extract_citations(text):
    """Extract and format citations from search results"""
    # Simple patterns to find URLs
    url_pattern = r'https?://[^\s)"]+'
    urls = re.findall(url_pattern, text)
    
    # Extract domain names for citation display
    citations = []
    for url in urls:
        # Extract domain
        domain_match = re.search(r'https?://(?:www\.)?([^/]+)', url)
        if domain_match:
            domain = domain_match.group(1)
            citations.append(f"{domain} ({url})")
    
    return citations

# Create medical agent with search capabilities
def create_medical_agent():
    gemini = init_gemini()
    if not gemini:
        return None
    
    # Initialize memory
    memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
    
    # Get search tool
    search_tool = init_search_tool()
    tools = [search_tool] if search_tool else []
    
    if tools:
        try:
            # Create agent with search capabilities
            agent = initialize_agent(
                tools,
                gemini,
                agent=AgentType.CONVERSATIONAL_REACT_DESCRIPTION,
                memory=memory,
                verbose=True
            )
            return agent
        except Exception as e:
            print(f"Error creating agent: {str(e)}")
    
    # Fallback to simple chain if agent creation fails
    medical_prompt = PromptTemplate(
        input_variables=["question", "chat_history"],
        template="""
        You are a helpful medical assistant providing information based on your knowledge.
        
        Chat history: {chat_history}
        User's medical question: {question}
        
        Provide an informative response and mention when information should be verified by healthcare professionals.
        also always include citations to reliable sources.
        """
    )
    
    chain = LLMChain(
        llm=gemini,
        prompt=medical_prompt,
        memory=memory
    )
    
    return chain

# Global agent instance
medical_agent = create_medical_agent()

@chat_bp.route('', methods=['POST'])
@token_required
def process_chat(user_id):
    """
    Process a medical chat prompt and return a response
    """
    data = request.get_json()
    
    # Validate the request data
    if not data or 'prompt' not in data:
        return jsonify({'response': 'Please provide a medical question to continue.'}), 400
    
    query = data['prompt']
    medical_terms = extract_medical_terms(query)
    
    # Process with medical agent
    try:
        if medical_agent:
            if hasattr(medical_agent, 'run'):  # Agent interface
                # Add medical terms to query for better context
                enhanced_query = query
                if medical_terms:
                    terms_text = ", ".join(medical_terms)
                    enhanced_query = f"{query}\n\nDetected medical terms: {terms_text}"
                
                response = medical_agent.run(enhanced_query)
            else:  # Chain interface
                response = medical_agent.run(question=query)
        else:
            # Direct model fallback
            gemini = init_gemini()
            if gemini:
                response = gemini.predict(query)
            else:
                response = "I'm currently unable to process medical queries. Please try again later."
    except Exception as e:
        print(f"Error processing query: {str(e)}")
        response = "I understand you have a medical question. While I can't access my full capabilities right now, I recommend consulting healthcare resources for medical concerns."
    
    # Process response to include citations
    citations = extract_citations(response)
    if citations:
        citation_text = "\n\nSources:\n" + "\n".join(citations)
        response = re.sub(r'https?://[^\s)"]+', '', response)  # Remove raw URLs
        response = response + citation_text
    
    # Remove excessive disclaimers but keep the information
    response = re.sub(r'(I am not a doctor|This is not medical advice|consult with a healthcare professional|cannot provide personalized medical diagnosis)', '', response)
    response = re.sub(r'\s+', ' ', response).strip()
    
    # Return in requested format
    return jsonify({'response': response}), 200